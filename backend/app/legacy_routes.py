"""Redirects for retired or hidden public views, before static page serving."""

from urllib.parse import urlencode

from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse

legacy_router = APIRouter(include_in_schema=False)


@legacy_router.api_route("/goals-coming-soon", methods=["GET", "HEAD"])
@legacy_router.api_route("/goals-coming-soon/", methods=["GET", "HEAD"])
@legacy_router.api_route("/goals-coming-soon/index.html", methods=["GET", "HEAD"])
@legacy_router.api_route("/justice-table", methods=["GET", "HEAD"])
@legacy_router.api_route("/justice-table/", methods=["GET", "HEAD"])
@legacy_router.api_route("/justice-table/index.html", methods=["GET", "HEAD"])
def hidden_xg_tables():
    # Hidden at the owner's request; keep bookmarks useful and restoration possible.
    return RedirectResponse("/tools/rolling-xg", status_code=302,
                            headers={"Cache-Control": "no-store"})


@legacy_router.api_route("/cl-closing-lines", methods=["GET", "HEAD"])
@legacy_router.api_route("/cl-closing-lines/index.html", methods=["GET", "HEAD"])
def champions_league_closes(request: Request):
    # Keep campaign/season filters, but this legacy view always means UCL.
    query = [(k, v) for k, v in request.query_params.multi_items() if k != "league"]
    query.append(("league", "soccer_uefa_champs_league"))
    return RedirectResponse("/closing-lines?" + urlencode(query), status_code=301)


@legacy_router.api_route("/power-rankings", methods=["GET", "HEAD"])
@legacy_router.api_route("/power-rankings/index.html", methods=["GET", "HEAD"])
def club_ratings(request: Request):
    query = str(request.url.query)
    target = "/tools/club-ratings" + ("?" + query if query else "")
    return RedirectResponse(target, status_code=301)
