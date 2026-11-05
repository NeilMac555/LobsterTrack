"""Small public HTML tables shared by the landing pages and their React views."""
from datetime import datetime
from html import escape
from threading import Lock
from time import monotonic
from urllib.parse import quote

from sqlalchemy import and_

from app.api.routes import _season_label, _season_start, fav_dog_report, telegram_report
from app.models import ClosingLine, OddsSnapshot
from app.models.closing_line import MarketType
from app.services.market_move_results import market_move_report


def table(title, note, headings, rows):
    header = ''.join(f'<th scope="col">{escape(h)}</th>' for h in headings)
    body = []
    for label, url, values in rows:
        name = escape(label)
        if url:
            name = f'<a href="{escape(url, quote=True)}">{name}</a>'
        cells = ''.join(f'<td>{escape(str(value))}</td>' for value in values)
        body.append(f'<tr><th scope="row">{name}</th>{cells}</tr>')
    contents = (f'<div class="snapshot-scroll"><table><thead><tr>{header}</tr></thead>'
                f'<tbody>{"".join(body)}</tbody></table></div>') if body else '<p>No qualifying records yet.</p>'
    return f'<section class="public-snapshot"><h2>{escape(title)}</h2><p>{escape(note)}</p>{contents}</section>'


def prices(home, draw, away):
    return ' / '.join(f'{value:.2f}' for value in (home, draw, away))


def latest_closes(db):
    c, s = ClosingLine, OddsSnapshot
    # Older captures do not store a bookmaker. Verify the actual snapshot
    # and all three prices before publishing any row as a Pinnacle close.
    verified = db.query(s.id).filter(and_(
        s.match_id == c.match_id, s.bookmaker == 'pinnacle', s.fetched_at == c.captured_at,
        s.home_odds == c.close_home, s.draw_odds == c.close_draw, s.away_odds == c.close_away,
        s.in_play.is_(False),
    )).exists()
    closes = db.query(c).filter(
        c.market_type == MarketType.H2H, c.kickoff_time <= datetime.utcnow(),
        c.captured_at < c.kickoff_time, c.close_home > 1, c.close_draw > 1, c.close_away > 1,
        verified,
    ).order_by(c.kickoff_time.desc(), c.captured_at.desc(), c.match_id).limit(5).all()
    rows = []
    for close in closes:
        opener = db.query(s).filter(
            s.match_id == close.match_id, s.bookmaker == 'pinnacle', s.in_play.is_(False),
            s.fetched_at <= close.captured_at, s.home_odds > 1, s.draw_odds > 1, s.away_odds > 1,
        ).order_by(s.fetched_at, s.id).first()
        if opener:
            rows.append((f'{close.home_team} vs {close.away_team}', '/match/' + quote(close.match_id, safe=''), [
                close.kickoff_time.strftime('%d %b %Y %H:%M'), prices(opener.home_odds, opener.draw_odds, opener.away_odds),
                prices(close.close_home, close.close_draw, close.close_away), close.captured_at.strftime('%d %b %H:%M:%S')]))
    return table('Latest five Pinnacle closes', 'All competitions. First and final recorded pre-kickoff decimal prices, in home / draw / away order. Times in UTC.',
                 ['Fixture', 'Kickoff', 'Opening 1X2', 'Closing 1X2', 'Close recorded'], rows)


def profit_row(label, settled, wins, units, roi, through):
    return (label, None, [through or '—', f'{settled:,}', f'{wins:,}', f'{settled-wins:,}',
                          f'{units:+.2f}u' if settled else '—', f'{roi:+.2f}%' if roi is not None else '—'])


PROFIT_COLUMNS = ['Selection', 'Through', 'Bets', 'Won', 'Lost', 'Net P/L', 'ROI']


def steam_summary(db):
    start = _season_start()
    moves = market_move_report(db, 1, start, _season_label(start), limit=0)
    alerts = telegram_report(db, limit=0)
    latest = moves['latest_settled_kickoff']
    return table('Season P/L across all competitions',
                 f'From {start:%d %b %Y}, one unit per settled bet. Qualifying team moves use the largest recorded move in the final two hours, by fixture date. Delivered Telegram alerts use the odds and date sent. The two samples can overlap.',
                 PROFIT_COLUMNS, [
                     profit_row('Qualifying steam moves', moves['total_moves'], moves['total_wins'], moves['profit_units'],
                                moves['roi_percent'], latest.date().isoformat() if latest else None),
                     profit_row('Delivered Telegram alerts', alerts.total_moves, alerts.total_wins, alerts.profit_units,
                                alerts.roi_percent, alerts.profit_history[-1].date if alerts.profit_history else None)])


def bias_summary(db):
    report = fav_dog_report(db)
    rows = [profit_row(label, band.matches, band.wins, band.profit_units,
                       100 * band.profit_units / band.matches if band.matches else None, report.data_through)
            for label, band in [('Favourite', report.fav_all), ('Underdog', report.dog_all), ('Draw', report.draw_all)]]
    return table('Favourite, underdog and draw returns',
                 'All five leagues combined from 2021/22. Each row stakes one unit per settled match at the recorded closing odds. Historical prices include a Betfair Exchange fallback for a gap in Pinnacle coverage.',
                 PROFIT_COLUMNS, rows)


BUILDERS = {'closing-lines': latest_closes, 'steam-results': steam_summary, 'longshot-bias': bias_summary}
_locks = {key: Lock() for key in BUILDERS}
_cache = {}


def get_summary(db, key):
    # Share the expensive season report between readers, including SPA visits.
    with _locks[key]:
        saved = _cache.get(key)
        if saved and saved[0] > monotonic():
            return saved[1]
        section = BUILDERS[key](db)
        _cache[key] = (monotonic() + 60, section)
        return section
