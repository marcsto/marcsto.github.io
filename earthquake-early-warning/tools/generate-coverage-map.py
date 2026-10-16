#!/usr/bin/env python3
"""Build the Android Earthquake Alerts coverage snapshot and SVG map.

The availability list comes from Android Help. Country boundaries come from
Natural Earth, whose map data is in the public domain.
"""

from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import math
import re
import tempfile
import unicodedata
import urllib.request
from pathlib import Path

try:
    from shapely.geometry import shape
    from shapely.geometry.base import BaseGeometry
except ImportError:  # The map still builds; it will simply contain more points.
    shape = None
    BaseGeometry = object


HELP_URL = "https://support.google.com/android/answer/9319337?hl=en"
ANNOUNCEMENT_URL = (
    "https://blog.google/products-and-platforms/platforms/android/"
    "android-earthquake-alerts-expansion-2026/"
)
BOUNDARY_URL = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/"
    "geojson/ne_50m_admin_0_countries.geojson"
)

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
SNAPSHOT_PATH = ASSETS / "android-earthquake-alerts-coverage-2026.json"
MAP_PATH = ASSETS / "android-earthquake-alerts-coverage-2026.svg"

WIDTH = 1600
HEIGHT = 940
MAP_LEFT = 58
MAP_TOP = 142
MAP_WIDTH = 1484
MAP_HEIGHT = 650

# Android Help and Natural Earth use a handful of different names for the same
# places. Values below are normalized Natural Earth names.
NAME_ALIASES = {
    "bosniaherzegovina": "bosniaandherzegovina",
    "czechiazechrepublic": "czechia",
    "democraticrepublicofthecongo": "demrepcongo",
    "myanmarformerlyburma": "myanmar",
    "republicofcongocongobrazzaville": "republicofthecongo",
    "sainthelenascensionandtristandacunha": "sainthelena",
    "saintmartinfrenchpart": "saintmartin",
    "swaziland": "eswatini",
    "turkey": "turkiye",
    "unitedstatesofamerica": "unitedstates",
    "virginislandsbritish": "britishvirginislands",
    "virginislandsus": "unitedstatesvirginislands",
}


def fetch_text(url: str) -> str:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "marc.ai coverage-map generator/1.0"},
    )
    with urllib.request.urlopen(request, timeout=45) as response:
        return response.read().decode("utf-8")


def extract_regions(page: str) -> list[str]:
    heading = "Where the Android Earthquake Alerts System is active"
    end_marker = "Earthquake alerts are on by default"
    start = page.index(heading)
    end = page.index(end_marker, start)
    block = page[start:end]
    regions = [
        html.unescape(re.sub(r"<[^>]+>", "", item)).strip()
        for item in re.findall(r"<li>(.*?)</li>", block, flags=re.DOTALL)
    ]
    regions = [region for region in regions if region]
    if len(regions) < 200 or "Guatemala" not in regions or "Panama" not in regions:
        raise RuntimeError("Android Help availability list did not match expectations")
    return regions


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFKD", value)
    value = value.encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"[^a-z0-9]", "", value)


def load_boundaries() -> dict:
    cache = Path(tempfile.gettempdir()) / "ne_50m_admin_0_countries.geojson"
    if not cache.exists():
        request = urllib.request.Request(
            BOUNDARY_URL,
            headers={"User-Agent": "marc.ai coverage-map generator/1.0"},
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            cache.write_bytes(response.read())
    return json.loads(cache.read_text(encoding="utf-8"))


def equal_earth(longitude: float, latitude: float) -> tuple[float, float]:
    """Project a longitude/latitude pair using the Equal Earth projection."""
    longitude = math.radians(longitude)
    latitude = math.radians(latitude)
    theta = math.asin(math.sqrt(3) * math.sin(latitude) / 2)
    theta2 = theta * theta
    theta6 = theta2 * theta2 * theta2
    denominator = 3 * (
        9 * 0.003796 * theta6 * theta2
        + 7 * 0.000893 * theta6
        + 3 * -0.081106 * theta2
        + 1.340264
    )
    x = 2 * math.sqrt(3) * longitude * math.cos(theta) / denominator
    y = theta * (
        0.003796 * theta6 * theta2
        + 0.000893 * theta6
        + -0.081106 * theta2
        + 1.340264
    )
    return x, y


PROJECTED_X_MAX = equal_earth(180, 0)[0]
PROJECTED_Y_MAX = equal_earth(0, 90)[1]


def project(longitude: float, latitude: float) -> tuple[float, float]:
    x, y = equal_earth(longitude, latitude)
    scale = min(MAP_WIDTH / (2 * PROJECTED_X_MAX), MAP_HEIGHT / (2 * PROJECTED_Y_MAX))
    px = MAP_LEFT + MAP_WIDTH / 2 + x * scale
    py = MAP_TOP + MAP_HEIGHT / 2 - y * scale
    return px, py


def line_path(points: list[tuple[float, float]], close: bool = False) -> str:
    if len(points) < 2:
        return ""
    projected = [project(lon, lat) for lon, lat in points]
    commands = [f"M{projected[0][0]:.1f},{projected[0][1]:.1f}"]
    previous = projected[0]
    for point in projected[1:]:
        # Natural Earth normally splits at the antimeridian. This guard keeps
        # an unusual ring from drawing a line across the whole map.
        if abs(point[0] - previous[0]) > MAP_WIDTH * 0.72:
            commands.append(f"M{point[0]:.1f},{point[1]:.1f}")
        elif math.dist(point, previous) >= 0.22:
            commands.append(f"L{point[0]:.1f},{point[1]:.1f}")
        previous = point
    if close:
        commands.append("Z")
    return "".join(commands)


def geometry_path(geometry: dict) -> str:
    kind = geometry["type"]
    coordinates = geometry["coordinates"]
    polygons = [coordinates] if kind == "Polygon" else coordinates
    parts: list[str] = []
    for polygon in polygons:
        for ring in polygon:
            path = line_path([(float(lon), float(lat)) for lon, lat in ring], close=True)
            if path:
                parts.append(path)
    return "".join(parts)


def graticule_path() -> str:
    paths: list[str] = []
    for longitude in range(-150, 180, 30):
        points = [(longitude, latitude) for latitude in range(-90, 91, 2)]
        paths.append(line_path(points))
    for latitude in range(-60, 90, 30):
        points = [(longitude, latitude) for longitude in range(-180, 181, 2)]
        paths.append(line_path(points))
    return "".join(paths)


def feature_is_supported(properties: dict, supported_names: set[str]) -> bool:
    candidates = {
        normalize(str(properties.get(field, "")))
        for field in ("ADMIN", "NAME_EN", "NAME_LONG", "BRK_NAME")
    }
    if candidates & supported_names:
        return True

    # Natural Earth draws these separately, while Android Help lists their
    # internationally recognized parent countries.
    admin = properties.get("ADMIN")
    return (admin == "Northern Cyprus" and "cyprus" in supported_names) or (
        admin == "Somaliland" and "somalia" in supported_names
    )


def build_svg(boundaries: dict, regions: list[str], as_of: str) -> str:
    supported_names = {normalize(region) for region in regions}
    supported_names.update(
        alias for source, alias in NAME_ALIASES.items() if source in supported_names
    )

    supported_paths: list[str] = []
    unsupported_paths: list[str] = []

    for feature in boundaries["features"]:
        geometry = feature["geometry"]
        if shape is not None:
            simplified: BaseGeometry = shape(geometry).simplify(0.035, preserve_topology=True)
            geometry = simplified.__geo_interface__
        path = geometry_path(geometry)
        target = (
            supported_paths
            if feature_is_supported(feature["properties"], supported_names)
            else unsupported_paths
        )
        target.append(path)

    # Windows' strftime does not support %-d.
    date_label = dt.date.fromisoformat(as_of).strftime("%B %d, %Y").replace(" 0", " ")

    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-labelledby="title description">
  <title id="title">Android Earthquake Alerts availability in more than 200 countries and regions</title>
  <desc id="description">World map showing the {len(regions)} countries and regions listed as active by Android Help on {date_label}. Supported regions are green and other regions are gray.</desc>
  <rect width="{WIDTH}" height="{HEIGHT}" rx="34" fill="#111318"/>
  <text x="58" y="62" fill="#f4f3ef" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700">Android Earthquake Alerts availability</text>
  <text x="58" y="98" fill="#a8abb4" font-family="Arial, Helvetica, sans-serif" font-size="20">{len(regions)} countries and regions listed by Android Help · {date_label}</text>
  <path d="{graticule_path()}" fill="none" stroke="#262b34" stroke-width="1"/>
  <path d="{''.join(unsupported_paths)}" fill="#343944" fill-rule="evenodd" stroke="#111820" stroke-width="1.15" stroke-linejoin="round"/>
  <path d="{''.join(supported_paths)}" fill="#66d18f" fill-rule="evenodd" stroke="#111820" stroke-width="1.15" stroke-linejoin="round"/>
  <g transform="translate(58 838)" font-family="Arial, Helvetica, sans-serif" font-size="17">
    <rect width="22" height="22" rx="4" fill="#66d18f"/><text x="34" y="17" fill="#f4f3ef">Listed as active</text>
    <rect x="210" width="22" height="22" rx="4" fill="#343944"/><text x="244" y="17" fill="#f4f3ef">Not listed as active</text>
  </g>
  <text x="58" y="898" fill="#8f939e" font-family="Arial, Helvetica, sans-serif" font-size="15">Source: Android Help · Boundaries: Natural Earth (public domain) · Small islands may be difficult to see at this scale.</text>
</svg>
'''


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--as-of", default=dt.date.today().isoformat())
    args = parser.parse_args()

    regions = extract_regions(fetch_text(HELP_URL))
    snapshot = {
        "asOf": args.as_of,
        "entryCount": len(regions),
        "officialWording": "more than 200 countries and regions",
        "source": HELP_URL,
        "announcement": ANNOUNCEMENT_URL,
        "regions": regions,
    }
    SNAPSHOT_PATH.write_text(
        json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    MAP_PATH.write_text(
        build_svg(load_boundaries(), regions, args.as_of),
        encoding="utf-8",
    )
    print(f"Wrote {SNAPSHOT_PATH.name} with {len(regions)} entries")
    print(f"Wrote {MAP_PATH.name}")


if __name__ == "__main__":
    main()
