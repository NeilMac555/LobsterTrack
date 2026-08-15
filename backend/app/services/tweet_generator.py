"""
Auto-tweet content generation for @Steamwatchio.

Two tweet types, each driven directly from the data we already capture:

  1. late_steam   — fired when the syndicate_alerter sends a Telegram alert.
                    Tweet headline: "🚨 LATE STEAM" + match + the move. This
                    is the "big move" signal — inherits the alerter's own
                    per-league window/threshold (WC: 24hr, 3.5pp).
  2. inplay_recap — fired ~10 min after kick-off. Pinnacle close → Polymarket
                    T+5 implied prob gap on 1X2 — the signal page surfaces.
                    Skipped when the match had an early goal (price reaction
                    is to a goal, not sharp money).

A third type, closing_line (pre-KO 'here's how the price moved' summary,
fired on a fixed schedule regardless of move size), was removed per Neil
2026-07-08 — SteamWatch is followed for big moves, not routine snapshots.

Posts go out via app.services.twitter_poster.post_tweet. Dedup against the
posted_tweets table — every send routes through `post_once` which is the
single point that records the row.

Style rules per Neil:
  - No links, no hashtags, no marketing CTAs
  - Country flag emojis on every team
  - Bare numbers, arrows, short sentences — let the data speak

A single team→flag lookup table covers the WC field. If a team is missing
it falls back to "" so the tweet still posts cleanly.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models import (
    Match,
    OddsSnapshot,
    PolymarketSnapshot,
    PostedTweet,
    ClosingLine,
)
from app.services.twitter_poster import post_tweet, TwitterStatus

logger = logging.getLogger(__name__)


# Country / team → flag emoji. Lowercased keys, normalized to handle the
# variants we've seen in production data (Cabo Verde vs Cape Verde, IR Iran
# vs Iran, etc.). When a team is missing we degrade gracefully to no flag.
TEAM_FLAGS: dict[str, str] = {
    "argentina": "🇦🇷",
    "algeria": "🇩🇿",
    "australia": "🇦🇺",
    "austria": "🇦🇹",
    "belgium": "🇧🇪",
    "bosnia & herzegovina": "🇧🇦",
    "bosnia and herzegovina": "🇧🇦",
    "brazil": "🇧🇷",
    "cabo verde": "🇨🇻",
    "cape verde": "🇨🇻",
    "canada": "🇨🇦",
    "chile": "🇨🇱",
    "colombia": "🇨🇴",
    "costa rica": "🇨🇷",
    "côte d'ivoire": "🇨🇮",
    "cote d'ivoire": "🇨🇮",
    "ivory coast": "🇨🇮",
    "croatia": "🇭🇷",
    "curacao": "🇨🇼",
    "curaçao": "🇨🇼",
    "czech republic": "🇨🇿",
    "czechia": "🇨🇿",
    "denmark": "🇩🇰",
    "ecuador": "🇪🇨",
    "egypt": "🇪🇬",
    "england": "🏴\U000e0067\U000e0062\U000e0065\U000e006e\U000e0067\U000e007f",
    "france": "🇫🇷",
    "germany": "🇩🇪",
    "ghana": "🇬🇭",
    "greece": "🇬🇷",
    "haiti": "🇭🇹",
    "honduras": "🇭🇳",
    "iran": "🇮🇷",
    "ir iran": "🇮🇷",
    "iraq": "🇮🇶",
    "italy": "🇮🇹",
    "japan": "🇯🇵",
    "jordan": "🇯🇴",
    "mexico": "🇲🇽",
    "morocco": "🇲🇦",
    "netherlands": "🇳🇱",
    "new zealand": "🇳🇿",
    "nigeria": "🇳🇬",
    "north korea": "🇰🇵",
    "korea dpr": "🇰🇵",
    "dpr korea": "🇰🇵",
    "norway": "🇳🇴",
    "panama": "🇵🇦",
    "paraguay": "🇵🇾",
    "peru": "🇵🇪",
    "poland": "🇵🇱",
    "portugal": "🇵🇹",
    "qatar": "🇶🇦",
    "republic of ireland": "🇮🇪",
    "saudi arabia": "🇸🇦",
    "scotland": "🏴\U000e0067\U000e0062\U000e0073\U000e0063\U000e0074\U000e007f",
    "senegal": "🇸🇳",
    "serbia": "🇷🇸",
    "south africa": "🇿🇦",
    "south korea": "🇰🇷",
    "korea republic": "🇰🇷",
    "spain": "🇪🇸",
    "sweden": "🇸🇪",
    "switzerland": "🇨🇭",
    "tunisia": "🇹🇳",
    "turkey": "🇹🇷",
    "türkiye": "🇹🇷",
    "ukraine": "🇺🇦",
    "uruguay": "🇺🇾",
    "usa": "🇺🇸",
    "united states": "🇺🇸",
    "venezuela": "🇻🇪",
    "wales": "🏴\U000e0067\U000e0062\U000e0077\U000e006c\U000e0073\U000e007f",
}


def flag(team: str) -> str:
    """Look up a country flag. Returns empty string if not found."""
    return TEAM_FLAGS.get((team or "").strip().lower(), "")


def _implied_pct(decimal_odds: Optional[float]) -> Optional[float]:
    if not decimal_odds or decimal_odds <= 0:
        return None
    return 100.0 / decimal_odds


def _already_posted(db: Session, tweet_type: str, match_id: Optional[str] = None, day_key: Optional[str] = None) -> bool:
    q = db.query(PostedTweet).filter(PostedTweet.tweet_type == tweet_type)
    if match_id is not None:
        q = q.filter(PostedTweet.match_id == match_id)
    if day_key is not None:
        q = q.filter(PostedTweet.day_key == day_key)
    return q.first() is not None


def _record_posted(
    db: Session,
    tweet_type: str,
    status: TwitterStatus,
    match_id: Optional[str] = None,
    day_key: Optional[str] = None,
) -> None:
    db.add(PostedTweet(
        match_id=match_id,
        tweet_type=tweet_type,
        tweet_id=status.tweet_id,
        day_key=day_key,
    ))
    db.commit()


def post_once(
    db: Session,
    tweet_type: str,
    text: str,
    match_id: Optional[str] = None,
    day_key: Optional[str] = None,
) -> TwitterStatus:
    """Post the tweet IF we haven't already posted this (type, match/day).
    Records the row only on a successful post. Safe to call repeatedly."""
    if _already_posted(db, tweet_type, match_id=match_id, day_key=day_key):
        return TwitterStatus(ok=False, detail="already posted")
    status = post_tweet(text)
    if status.ok:
        try:
            _record_posted(db, tweet_type, status, match_id=match_id, day_key=day_key)
        except Exception as e:
            # If we tweeted but failed to record, log loudly so we can fix
            # the row manually; the tweet itself is already public.
            logger.error(
                "Posted tweet but failed to record",
                extra={"tweet_id": status.tweet_id, "error": str(e)},
            )
    return status


# ---------------------------------------------------------------------------
# Tweet templates
# ---------------------------------------------------------------------------


def render_late_steam_tweet(
    match: Match,
    outcome_name: str,
    opening_odds: float,
    current_odds: float,
    prob_change_pp: float,
    minutes_to_ko: int,
) -> str:
    """
    🚨 LATE STEAM

    🇩🇪 Germany 🆚 🇨🇮 Ivory Coast
    KO in 25 min

    Germany 1.68 → 1.45 (+4.9pp implied)
    Sharp money piling in.

    Shows the actual opening → current price, not just the current
    price + a pp delta — a reader shouldn't have to do implied-
    probability math in their head to see the price shortened rather
    than drifted (Neil flagged a tweet where "7.28 (+3.2pp implied
    since open)" read as ambiguous/self-contradictory next to "sharp
    money piling in" even though the pp figure was directionally
    correct — prob_movement() in syndicate_alerter.py already only
    ever fires this alert on a positive/shortening move).
    """
    hf = flag(match.home_team)
    af = flag(match.away_team)
    ko_str = f"KO in {minutes_to_ko} min" if minutes_to_ko >= 0 else f"Live (T+{abs(minutes_to_ko)} min)"
    sign = "+" if prob_change_pp >= 0 else ""
    return (
        "🚨 LATE STEAM\n"
        "\n"
        f"{hf} {match.home_team} 🆚 {af} {match.away_team}\n"
        f"{ko_str}\n"
        "\n"
        f"{outcome_name} {opening_odds:.2f} → {current_odds:.2f} ({sign}{prob_change_pp:.1f}pp implied)\n"
        "Sharp money piling in."
    )


@dataclass
class TotalsBlock:
    open_line: Optional[float]
    open_over: Optional[float]
    open_under: Optional[float]
    close_line: Optional[float]
    close_over: Optional[float]
    close_under: Optional[float]


@dataclass
class SpreadsBlock:
    open_line: Optional[float]
    open_home: Optional[float]
    open_away: Optional[float]
    close_line: Optional[float]
    close_home: Optional[float]
    close_away: Optional[float]



def render_inplay_recap_tweet(
    match: Match,
    pin_home_imp: float, pin_draw_imp: float, pin_away_imp: float,
    pm_home_yes: float, pm_draw_yes: float, pm_away_yes: float,
    anchor_minutes_in: float,
) -> str:
    """
    ⚡ Pinnacle close → Polymarket T+5

    🇧🇪 Belgium 🆚 🇪🇬 Egypt

    Belgium 65% → 35% (-30pp)
    Egypt 14% → 35% (+21pp)
    Draw 22% → 30% (+8pp)
    """
    hf = flag(match.home_team)
    af = flag(match.away_team)

    def row(name: str, pin: float, pm: float) -> str:
        pin_p = pin * 100
        pm_p = pm * 100
        gap = pm_p - pin_p
        sign = "+" if gap >= 0 else ""
        return f"{name} {pin_p:.0f}% → {pm_p:.0f}% ({sign}{gap:.0f}pp)"

    return (
        f"⚡ Pinnacle close → Polymarket T+{int(anchor_minutes_in)}\n"
        "\n"
        f"{hf} {match.home_team} 🆚 {af} {match.away_team}\n"
        "\n"
        f"{row(match.home_team, pin_home_imp, pm_home_yes)}\n"
        f"{row('Draw', pin_draw_imp, pm_draw_yes)}\n"
        f"{row(match.away_team, pin_away_imp, pm_away_yes)}"
    )


# ---------------------------------------------------------------------------
# High-level posters — called from the scheduler / alerter
# ---------------------------------------------------------------------------


def post_late_steam_tweet(
    db: Session,
    match: Match,
    outcome_name: str,
    opening_odds: float,
    current_odds: float,
    prob_change_pp: float,
    minutes_to_ko: int,
) -> TwitterStatus:
    """Called from syndicate_alerter when a Telegram alert fires.
    One tweet per match max — subsequent steam alerts on the same match
    add Telegram messages but no new tweet."""
    text = render_late_steam_tweet(
        match, outcome_name, opening_odds, current_odds, prob_change_pp, minutes_to_ko
    )
    return post_once(db, "late_steam", text, match_id=match.id)


SIGNIFICANCE_THRESHOLD_PP = 3.0


def _max_1x2_move_pp(opening, latest) -> float:
    """Biggest absolute implied-prob swing (pp) across home/draw/away
    between opening and latest. Returns 0.0 if any odds missing."""
    if not (opening.home_odds and opening.draw_odds and opening.away_odds):
        return 0.0
    if not (latest.home_odds and latest.draw_odds and latest.away_odds):
        return 0.0
    moves = [
        abs(_implied_pct(latest.home_odds) - _implied_pct(opening.home_odds)),
        abs(_implied_pct(latest.draw_odds) - _implied_pct(opening.draw_odds)),
        abs(_implied_pct(latest.away_odds) - _implied_pct(opening.away_odds)),
    ]
    return max(moves)


def _totals_significant(block: Optional["TotalsBlock"]) -> bool:
    """True if the totals line shifted OR over/under implied probs
    moved by the threshold."""
    if block is None:
        return False
    if block.open_line is not None and block.close_line is not None:
        if block.open_line != block.close_line:
            return True
    if block.open_over and block.close_over:
        if abs(_implied_pct(block.close_over) - _implied_pct(block.open_over)) >= SIGNIFICANCE_THRESHOLD_PP:
            return True
    if block.open_under and block.close_under:
        if abs(_implied_pct(block.close_under) - _implied_pct(block.open_under)) >= SIGNIFICANCE_THRESHOLD_PP:
            return True
    return False


def _spreads_significant(block: Optional["SpreadsBlock"]) -> bool:
    """True if the AH line shifted OR home/away implied probs moved
    by the threshold."""
    if block is None:
        return False
    if block.open_line is not None and block.close_line is not None:
        if block.open_line != block.close_line:
            return True
    if block.open_home and block.close_home:
        if abs(_implied_pct(block.close_home) - _implied_pct(block.open_home)) >= SIGNIFICANCE_THRESHOLD_PP:
            return True
    if block.open_away and block.close_away:
        if abs(_implied_pct(block.close_away) - _implied_pct(block.open_away)) >= SIGNIFICANCE_THRESHOLD_PP:
            return True
    return False


def try_post_inplay_recap_tweet(db: Session, match: Match) -> Optional[TwitterStatus]:
    """Generate + post the T+10 in-play recap tweet for `match`.
    Skips early-goal matches (signal contaminated by public info)."""
    if _already_posted(db, "inplay_recap", match_id=match.id):
        return None
    if match.early_goal_minute is not None:
        # Record a no-op row so we never re-evaluate this match for recap.
        db.add(PostedTweet(
            match_id=match.id, tweet_type="inplay_recap_skipped_early_goal", tweet_id=None,
        ))
        db.commit()
        return None
    # Pinnacle 1X2 closing line
    close = (
        db.query(ClosingLine)
        .filter(ClosingLine.match_id == match.id)
        .filter(ClosingLine.market_type == "1x2")
        .first()
    )
    if not close or not close.close_home or not close.close_draw or not close.close_away:
        return None
    # Polymarket T+5..T+10 in-play anchor
    from datetime import timedelta
    anchor_ts = match.commence_time + timedelta(minutes=5)
    pm = (
        db.query(PolymarketSnapshot)
        .filter(PolymarketSnapshot.match_id == match.id)
        .filter(PolymarketSnapshot.in_play == True)  # noqa: E712
        .filter(PolymarketSnapshot.fetched_at >= anchor_ts)
        .order_by(PolymarketSnapshot.fetched_at.asc())
        .first()
    )
    if not pm or pm.home_win_yes is None or pm.draw_yes is None or pm.away_win_yes is None:
        return None
    anchor_minutes_in = (pm.fetched_at - match.commence_time).total_seconds() / 60
    if anchor_minutes_in > 10:
        # We caught the Polymarket snapshot too late — same gate as the
        # /api/in-play-jumps endpoint uses, so we stay calibrated.
        return None
    pin_home = _implied_pct(close.close_home) / 100
    pin_draw = _implied_pct(close.close_draw) / 100
    pin_away = _implied_pct(close.close_away) / 100

    # Significance gate: largest |gap_pp| across home/draw/away
    # between Pinnacle close and Polymarket T+5 must clear the
    # threshold. Same convention as /api/in-play-jumps leaderboard.
    gaps_pp = [
        abs((pm.home_win_yes - pin_home) * 100),
        abs((pm.draw_yes - pin_draw) * 100),
        abs((pm.away_win_yes - pin_away) * 100),
    ]
    if max(gaps_pp) < SIGNIFICANCE_THRESHOLD_PP:
        return None

    text = render_inplay_recap_tweet(
        match,
        pin_home, pin_draw, pin_away,
        pm.home_win_yes, pm.draw_yes, pm.away_win_yes,
        anchor_minutes_in,
    )
    return post_once(db, "inplay_recap", text, match_id=match.id)
