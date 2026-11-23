"""Permanent redirects for retired public views, before static page serving."""

from urllib.parse import urlencode

from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse

legacy_router = APIRouter(include_in_schema=False)


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
