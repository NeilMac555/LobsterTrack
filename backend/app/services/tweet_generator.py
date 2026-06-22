"""
Auto-tweet content generation for @Steamwatchio.

Three tweet types, each driven directly from the data we already capture:

  1. late_steam   — fired when the syndicate_alerter sends a Telegram alert.
                    Tweet headline: "🚨 LATE STEAM" + match + the move.
  2. closing_line — fired ~15 min before kick-off. Snapshots Pinnacle's
                    closing 1X2 vs opening so subscribers can see who's been
                    backed late.
  3. inplay_recap — fired ~10 min after kick-off. Pinnacle close → Polymarket
                    T+5 implied prob gap on 1X2 — the signal page surfaces.
                    Skipped when the match had an early goal (price reaction
                    is to a goal, not sharp money).

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
    current_odds: float,
    prob_change_pp: float,
    minutes_to_ko: int,
) -> str:
    """
    🚨 LATE STEAM

    🇩🇪 Germany 🆚 🇨🇮 Ivory Coast
    KO in 25 min

    Germany 1.45 (+4.9pp implied since open)
    Sharp money piling in.
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
        f"{outcome_name} {current_odds:.2f} ({sign}{prob_change_pp:.1f}pp implied since open)\n"
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


def _fmt_line(v: Optional[float]) -> str:
    """+0.5 / -2.5 / 3.0 style formatting for a numeric line."""
    if v is None:
        return "—"
    if v > 0:
        return f"+{v:g}"
    return f"{v:g}"


def render_closing_line_tweet(
    match: Match,
    current_home: float, current_draw: float, current_away: float,
    opening_home: float, opening_draw: float, opening_away: float,
    totals: Optional[TotalsBlock] = None,
    spreads: Optional[SpreadsBlock] = None,
) -> str:
    """
    🔔 Closing — KO in 15 min

    🇪🇸 Spain 🆚 🇸🇦 Saudi Arabia

    1X2: 1.11 / 12 / 24
    O/U 3.5: O 2.05 / U 1.85 (open line 4.0)
    AH -2.5: H 1.92 / A 1.97 (open -2)

    Money on Over and Spain to cover.
    """
    hf = flag(match.home_team)
    af = flag(match.away_team)

    # 1X2 mover signal — used in the interpretation line at the end.
    def shift(open_o, now_o):
        if not open_o or not now_o:
            return None
        return (100.0 / now_o) - (100.0 / open_o)
    sh = shift(opening_home, current_home)
    sd = shift(opening_draw, current_draw)
    sa = shift(opening_away, current_away)
    name_shifts = [
        (match.home_team, sh),
        ("Draw", sd),
        (match.away_team, sa),
    ]
    name_shifts = [(n, s) for n, s in name_shifts if s is not None]

    lines: list[str] = [
        "🔔 Closing — KO in 15 min",
        "",
        f"{hf} {match.home_team} 🆚 {af} {match.away_team}",
        "",
        f"1X2: {current_home:.2f} / {current_draw:.2f} / {current_away:.2f}",
    ]

    # Totals (over/under goals) — only render when we have closing data.
    # We show the line shift inline because that's the spiciest detail
    # ("market moved from 3.5 to 3" tells you sharps wanted fewer goals).
    if totals and totals.close_line is not None and totals.close_over and totals.close_under:
        line_part = ""
        if totals.open_line is not None and totals.open_line != totals.close_line:
            line_part = f" (line shifted {totals.open_line:g} → {totals.close_line:g})"
        lines.append(
            f"O/U {totals.close_line:g}: O {totals.close_over:.2f} / U {totals.close_under:.2f}{line_part}"
        )

    # Asian Handicap — home perspective. Same line-shift annotation.
    if spreads and spreads.close_line is not None and spreads.close_home and spreads.close_away:
        line_part = ""
        if spreads.open_line is not None and spreads.open_line != spreads.close_line:
            line_part = f" (line shifted {_fmt_line(spreads.open_line)} → {_fmt_line(spreads.close_line)})"
        lines.append(
            f"AH {_fmt_line(spreads.close_line)}: H {spreads.close_home:.2f} / A {spreads.close_away:.2f}{line_part}"
        )

    # Interpretation. Lead with the most informative signal across the
    # three markets. Priority: line shift > 1X2 mover > steady.
    interp: Optional[str] = None
    if totals and totals.open_line is not None and totals.close_line is not None:
        diff = totals.close_line - totals.open_line
        if diff >= 0.25:
            interp = "Market moved the goals line UP — sharps want Over."
        elif diff <= -0.25:
            interp = "Market moved the goals line DOWN — sharps want Under."
    if interp is None and spreads and spreads.open_line is not None and spreads.close_line is not None:
        diff = spreads.close_line - spreads.open_line
        if diff <= -0.25:
            interp = f"AH line tightened — sharps want more from {match.home_team}."
        elif diff >= 0.25:
            interp = f"AH line widened — sharps backing {match.away_team}."
    if interp is None and name_shifts:
        winner = max(name_shifts, key=lambda kv: kv[1])
        if winner[1] >= 1.5:
            interp = f"Money on {winner[0]}."
        elif winner[1] <= -1.5:
            interp = f"Money fading {winner[0]}."
        else:
            interp = "Steady book — minimal late action."

    if interp:
        lines.append("")
        lines.append(interp)

    return "\n".join(lines)


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
    current_odds: float,
    prob_change_pp: float,
    minutes_to_ko: int,
) -> TwitterStatus:
    """Called from syndicate_alerter when a Telegram alert fires.
    One tweet per match max — subsequent steam alerts on the same match
    add Telegram messages but no new tweet."""
    text = render_late_steam_tweet(
        match, outcome_name, current_odds, prob_change_pp, minutes_to_ko
    )
    return post_once(db, "late_steam", text, match_id=match.id)


def _totals_block(db: Session, match: Match) -> Optional["TotalsBlock"]:
    """Open + close TotalsSnapshot — using the FIRST snapshot in the
    12-hour pre-KO window as 'open'. Months of pre-match noise hides
    the actual steam; the last 12 hours is where the action is."""
    from datetime import timedelta
    from app.models import TotalsSnapshot
    window_start = match.commence_time - timedelta(hours=12)
    opening = (
        db.query(TotalsSnapshot)
        .filter(TotalsSnapshot.match_id == match.id)
        .filter(TotalsSnapshot.fetched_at >= window_start)
        .order_by(TotalsSnapshot.fetched_at.asc(), TotalsSnapshot.id.asc())
        .first()
    )
    closing = (
        db.query(TotalsSnapshot)
        .filter(TotalsSnapshot.match_id == match.id)
        .order_by(TotalsSnapshot.fetched_at.desc(), TotalsSnapshot.id.desc())
        .first()
    )
    if not opening and not closing:
        return None
    return TotalsBlock(
        open_line=opening.line if opening else None,
        open_over=opening.over_odds if opening else None,
        open_under=opening.under_odds if opening else None,
        close_line=closing.line if closing else None,
        close_over=closing.over_odds if closing else None,
        close_under=closing.under_odds if closing else None,
    )


def _spreads_block(db: Session, match: Match) -> Optional["SpreadsBlock"]:
    """Open + close SpreadsSnapshot — same 12-hour pre-KO window as
    totals so the tweet shows actual steam, not weeks of retail noise."""
    from datetime import timedelta
    from app.models import SpreadsSnapshot
    window_start = match.commence_time - timedelta(hours=12)
    opening = (
        db.query(SpreadsSnapshot)
        .filter(SpreadsSnapshot.match_id == match.id)
        .filter(SpreadsSnapshot.fetched_at >= window_start)
        .order_by(SpreadsSnapshot.fetched_at.asc(), SpreadsSnapshot.id.asc())
        .first()
    )
    closing = (
        db.query(SpreadsSnapshot)
        .filter(SpreadsSnapshot.match_id == match.id)
        .order_by(SpreadsSnapshot.fetched_at.desc(), SpreadsSnapshot.id.desc())
        .first()
    )
    if not opening and not closing:
        return None
    return SpreadsBlock(
        open_line=opening.line if opening else None,
        open_home=opening.home_odds if opening else None,
        open_away=opening.away_odds if opening else None,
        close_line=closing.line if closing else None,
        close_home=closing.home_odds if closing else None,
        close_away=closing.away_odds if closing else None,
    )


def try_post_closing_line_tweet(db: Session, match: Match) -> Optional[TwitterStatus]:
    """Generate + post the T-15 closing-line tweet for `match`.
    Returns None if we don't have enough data; status object otherwise.

    'Opening' here is the first pre-KO snapshot inside the 12-hour
    window before KO — that's where the actual steam lives. Months
    of pre-match noise drowns out the late sharp action."""
    from datetime import timedelta
    if _already_posted(db, "closing_line", match_id=match.id):
        return None
    window_start = match.commence_time - timedelta(hours=12)
    latest = (
        db.query(OddsSnapshot)
        .filter(OddsSnapshot.match_id == match.id)
        .filter(OddsSnapshot.in_play == False)  # noqa: E712
        .order_by(OddsSnapshot.fetched_at.desc())
        .first()
    )
    opening = (
        db.query(OddsSnapshot)
        .filter(OddsSnapshot.match_id == match.id)
        .filter(OddsSnapshot.in_play == False)  # noqa: E712
        .filter(OddsSnapshot.fetched_at >= window_start)
        .order_by(OddsSnapshot.fetched_at.asc())
        .first()
    )
    if not latest or not opening:
        return None
    if not (latest.home_odds and latest.draw_odds and latest.away_odds):
        return None
    if not (opening.home_odds and opening.draw_odds and opening.away_odds):
        return None
    text = render_closing_line_tweet(
        match,
        latest.home_odds, latest.draw_odds, latest.away_odds,
        opening.home_odds, opening.draw_odds, opening.away_odds,
        totals=_totals_block(db, match),
        spreads=_spreads_block(db, match),
    )
    return post_once(db, "closing_line", text, match_id=match.id)


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
    text = render_inplay_recap_tweet(
        match,
        pin_home, pin_draw, pin_away,
        pm.home_win_yes, pm.draw_yes, pm.away_win_yes,
        anchor_minutes_in,
    )
    return post_once(db, "inplay_recap", text, match_id=match.id)
