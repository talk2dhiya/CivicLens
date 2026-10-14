import math
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
import numpy as np
from sklearn.cluster import DBSCAN

EARTH_RADIUS_METERS = 6_371_000.0

HOTSPOT_DISCLAIMER = (
    "Hotspots indicate concentrations of submitted citizen reports, "
    "not verified ground danger, severity, or future risk."
)

VALID_TIME_RANGES = {"7d", "30d", "90d", "all"}


def haversine_distance_meters(
    lat1: float, lon1: float, lat2: float, lon2: float
) -> float:
    """Calculate the great-circle distance between two points on Earth in meters."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return EARTH_RADIUS_METERS * c


def parse_iso_datetime(dt_str: str) -> Optional[datetime]:
    """Parse ISO datetime string, supporting Z and offset forms."""
    if not dt_str:
        return None
    try:
        # Standardize 'Z' to UTC
        clean_str = dt_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(clean_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def filter_reports_by_time(
    reports: List[Dict[str, Any]], time_range: str
) -> List[Dict[str, Any]]:
    """Filter reports based on the time_range ('7d', '30d', '90d', 'all')."""
    if time_range == "all":
        return reports

    days_map = {"7d": 7, "30d": 30, "90d": 90}
    days = days_map.get(time_range)
    if not days:
        raise ValueError(
            f"Invalid time_range '{time_range}'. Must be one of: {', '.join(sorted(VALID_TIME_RANGES))}"
        )

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    filtered = []
    for r in reports:
        dt = parse_iso_datetime(r.get("created_at", ""))
        if dt is not None and dt >= cutoff:
            filtered.append(r)
    return filtered


def find_hotspots(
    reports: List[Dict[str, Any]],
    category: Optional[str] = None,
    status: Optional[str] = None,
    time_range: str = "all",
    eps_meters: float = 500.0,
    min_samples: int = 3,
) -> Dict[str, Any]:
    """
    Perform DBSCAN hotspot clustering on geolocated civic reports.

    Parameters:
        reports: List of report dictionaries.
        category: Optional category filter.
        status: Optional status filter.
        time_range: '7d', '30d', '90d', or 'all'.
        eps_meters: Distance threshold in meters (default: 500m).
        min_samples: Minimum reports required to form a cluster (default: 3).

    Returns:
        Structured dictionary containing hotspots, noise reports, parameters, and disclaimer.
    """
    if eps_meters <= 0:
        raise ValueError("eps_meters must be a positive number greater than 0.")
    if min_samples < 1:
        raise ValueError("min_samples must be an integer greater than or equal to 1.")
    if time_range not in VALID_TIME_RANGES:
        raise ValueError(
            f"Invalid time_range '{time_range}'. Allowed values: {', '.join(sorted(VALID_TIME_RANGES))}"
        )

    # Filter out reports with missing or invalid coordinates
    valid_coords_reports = [
        r
        for r in reports
        if r.get("latitude") is not None
        and r.get("longitude") is not None
        and -90.0 <= float(r["latitude"]) <= 90.0
        and -180.0 <= float(r["longitude"]) <= 180.0
    ]

    # Apply category filter
    if category and category != "ALL":
        valid_coords_reports = [
            r for r in valid_coords_reports if r.get("category") == category
        ]

    # Apply status filter
    if status and status != "ALL":
        valid_coords_reports = [
            r for r in valid_coords_reports if r.get("status") == status
        ]

    # Apply time range filter
    valid_coords_reports = filter_reports_by_time(valid_coords_reports, time_range)

    parameters_used = {
        "category": category if category != "ALL" else None,
        "status": status if status != "ALL" else None,
        "time_range": time_range,
        "eps_meters": float(eps_meters),
        "min_samples": int(min_samples),
        "total_reports_evaluated": len(valid_coords_reports),
    }

    # Empty dataset handling
    if not valid_coords_reports:
        return {
            "hotspots": [],
            "noise_reports": [],
            "parameters_used": parameters_used,
            "disclaimer": HOTSPOT_DISCLAIMER,
        }

    # If fewer reports than min_samples, all are isolated noise points
    if len(valid_coords_reports) < min_samples:
        noise = [
            {
                "id": r["id"],
                "category": r["category"],
                "status": r["status"],
                "location_text": r.get("location_text", ""),
                "latitude": float(r["latitude"]),
                "longitude": float(r["longitude"]),
                "created_at": r.get("created_at", ""),
                "image_path": r.get("image_path", ""),
            }
            for r in valid_coords_reports
        ]
        return {
            "hotspots": [],
            "noise_reports": noise,
            "parameters_used": parameters_used,
            "disclaimer": HOTSPOT_DISCLAIMER,
        }

    # Convert coordinates to radians for Haversine DBSCAN
    coords = np.array(
        [[float(r["latitude"]), float(r["longitude"])] for r in valid_coords_reports]
    )
    coords_rad = np.radians(coords)
    eps_rad = eps_meters / EARTH_RADIUS_METERS

    # Execute DBSCAN clustering
    db = DBSCAN(
        eps=eps_rad, min_samples=min_samples, metric="haversine", algorithm="ball_tree"
    )
    labels = db.fit_predict(coords_rad)

    hotspots = []
    noise_reports = []

    unique_labels = set(labels)
    for label in unique_labels:
        if label == -1:
            # Noise points (isolated reports)
            noise_indices = np.where(labels == -1)[0]
            for idx in noise_indices:
                r = valid_coords_reports[idx]
                noise_reports.append(
                    {
                        "id": r["id"],
                        "category": r["category"],
                        "status": r["status"],
                        "location_text": r.get("location_text", ""),
                        "latitude": float(r["latitude"]),
                        "longitude": float(r["longitude"]),
                        "created_at": r.get("created_at", ""),
                        "image_path": r.get("image_path", ""),
                    }
                )
        else:
            # Cluster of reports
            cluster_indices = np.where(labels == label)[0]
            cluster_reports = [valid_coords_reports[i] for i in cluster_indices]

            # Representative centroid
            lats = [float(r["latitude"]) for r in cluster_reports]
            lngs = [float(r["longitude"]) for r in cluster_reports]
            centroid_lat = float(np.mean(lats))
            centroid_lng = float(np.mean(lngs))

            # Bounding radius (max distance from centroid to member point, at least 50m)
            distances = [
                haversine_distance_meters(
                    centroid_lat, centroid_lng, float(r["latitude"]), float(r["longitude"])
                )
                for r in cluster_reports
            ]
            radius_meters = max(max(distances), 50.0)

            # Summaries
            cat_counts = dict(Counter(r["category"] for r in cluster_reports))
            status_counts = dict(Counter(r["status"] for r in cluster_reports))
            report_ids = [r["id"] for r in cluster_reports]

            hotspots.append(
                {
                    "id": f"hotspot-{label + 1}",
                    "centroid": {
                        "latitude": round(centroid_lat, 6),
                        "longitude": round(centroid_lng, 6),
                    },
                    "radius_meters": round(radius_meters, 1),
                    "report_count": len(cluster_reports),
                    "category_breakdown": cat_counts,
                    "status_breakdown": status_counts,
                    "report_ids": report_ids,
                    "sample_reports": [
                        {
                            "id": r["id"],
                            "category": r["category"],
                            "status": r["status"],
                            "location_text": r.get("location_text", ""),
                            "latitude": float(r["latitude"]),
                            "longitude": float(r["longitude"]),
                            "created_at": r.get("created_at", ""),
                            "image_path": r.get("image_path", ""),
                        }
                        for r in cluster_reports
                    ],
                }
            )

    # Sort hotspots by report count descending
    hotspots.sort(key=lambda h: h["report_count"], reverse=True)

    return {
        "hotspots": hotspots,
        "noise_reports": noise_reports,
        "parameters_used": parameters_used,
        "disclaimer": HOTSPOT_DISCLAIMER,
    }
