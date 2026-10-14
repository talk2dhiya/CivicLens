"""
Automated unit tests for DBSCAN hotspot clustering using synthetic coordinates.
Verifies cluster formation, noise retention, category/status/time filtering,
and edge cases (empty data, missing coordinates).
"""

from datetime import datetime, timedelta, timezone
import pytest
from backend.services.hotspots import find_hotspots, haversine_distance_meters


def test_haversine_distance_meters():
    # Distance between two known points in Vellore
    # Point 1: 12.9165, 79.1325
    # Point 2: 12.9200, 79.1325 (approx 389 meters north)
    dist = haversine_distance_meters(12.9165, 79.1325, 12.9200, 79.1325)
    assert 380.0 < dist < 400.0


def test_synthetic_clusters_and_isolated_noise():
    """
    Test a synthetic dataset with:
    - 3 points tightly clustered within 150m (should form a hotspot)
    - 2 isolated points 15km away (should be marked as noise)
    """
    now_iso = datetime.now(timezone.utc).isoformat()

    # Dense cluster A around [12.9165, 79.1325]
    p1 = {"id": 1, "category": "Road Damage / Potholes", "status": "Pending", "latitude": 12.9165, "longitude": 79.1325, "created_at": now_iso}
    p2 = {"id": 2, "category": "Road Damage / Potholes", "status": "Pending", "latitude": 12.9170, "longitude": 79.1328, "created_at": now_iso}
    p3 = {"id": 3, "category": "Road Damage / Potholes", "status": "Acknowledged", "latitude": 12.9168, "longitude": 79.1322, "created_at": now_iso}

    # Isolated points 15km away
    p_isolated1 = {"id": 4, "category": "Broken Streetlights", "status": "Pending", "latitude": 13.0500, "longitude": 79.2500, "created_at": now_iso}
    p_isolated2 = {"id": 5, "category": "Garbage Overflow", "status": "In Progress", "latitude": 12.7500, "longitude": 78.9500, "created_at": now_iso}

    reports = [p1, p2, p3, p_isolated1, p_isolated2]

    result = find_hotspots(reports, eps_meters=500.0, min_samples=3)

    # Assertions
    assert len(result["hotspots"]) == 1, "Should detect exactly 1 hotspot"
    hotspot = result["hotspots"][0]
    assert hotspot["report_count"] == 3
    assert set(hotspot["report_ids"]) == {1, 2, 3}
    assert hotspot["category_breakdown"]["Road Damage / Potholes"] == 3
    assert hotspot["status_breakdown"]["Pending"] == 2
    assert hotspot["status_breakdown"]["Acknowledged"] == 1

    # Isolated points preserved in noise_reports
    assert len(result["noise_reports"]) == 2, "Should preserve isolated reports as noise"
    noise_ids = {r["id"] for r in result["noise_reports"]}
    assert noise_ids == {4, 5}
    assert "disclaimer" in result


def test_category_filtering():
    """Verify that filtering by category removes non-matching reports and affects clustering."""
    now_iso = datetime.now(timezone.utc).isoformat()

    # 2 Road damage reports and 2 Water leak reports at same tight location
    p1 = {"id": 1, "category": "Road Damage / Potholes", "status": "Pending", "latitude": 12.9165, "longitude": 79.1325, "created_at": now_iso}
    p2 = {"id": 2, "category": "Road Damage / Potholes", "status": "Pending", "latitude": 12.9168, "longitude": 79.1328, "created_at": now_iso}
    p3 = {"id": 3, "category": "Water Leakage", "status": "Pending", "latitude": 12.9167, "longitude": 79.1326, "created_at": now_iso}
    p4 = {"id": 4, "category": "Water Leakage", "status": "Pending", "latitude": 12.9169, "longitude": 79.1327, "created_at": now_iso}

    reports = [p1, p2, p3, p4]

    # Without filter (min_samples=3), all 4 form 1 hotspot
    res_all = find_hotspots(reports, min_samples=3)
    assert len(res_all["hotspots"]) == 1
    assert res_all["hotspots"][0]["report_count"] == 4

    # Filter for 'Road Damage / Potholes': only 2 reports remain, min_samples=3 -> no hotspot, all noise
    res_road = find_hotspots(reports, category="Road Damage / Potholes", min_samples=3)
    assert len(res_road["hotspots"]) == 0
    assert len(res_road["noise_reports"]) == 2
    assert {r["id"] for r in res_road["noise_reports"]} == {1, 2}


def test_time_range_filtering():
    """Verify time range filtering excludes reports older than the cutoff."""
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    old_iso = (now - timedelta(days=20)).isoformat()

    # 3 points in a cluster: 2 are recent, 1 is 20 days old
    p1 = {"id": 1, "category": "Road Damage / Potholes", "status": "Pending", "latitude": 12.9165, "longitude": 79.1325, "created_at": now_iso}
    p2 = {"id": 2, "category": "Road Damage / Potholes", "status": "Pending", "latitude": 12.9168, "longitude": 79.1328, "created_at": now_iso}
    p3 = {"id": 3, "category": "Road Damage / Potholes", "status": "Pending", "latitude": 12.9167, "longitude": 79.1326, "created_at": old_iso}

    reports = [p1, p2, p3]

    # 'all' time: 3 reports meet min_samples=3 -> 1 hotspot
    res_all = find_hotspots(reports, time_range="all", min_samples=3)
    assert len(res_all["hotspots"]) == 1
    assert res_all["hotspots"][0]["report_count"] == 3

    # '7d' time: 20-day-old report excluded -> only 2 reports remain -> min_samples=3 not met -> 0 hotspots
    res_7d = find_hotspots(reports, time_range="7d", min_samples=3)
    assert len(res_7d["hotspots"]) == 0
    assert len(res_7d["noise_reports"]) == 2

    # '30d' time: 20-day-old report included -> 1 hotspot
    res_30d = find_hotspots(reports, time_range="30d", min_samples=3)
    assert len(res_30d["hotspots"]) == 1


def test_empty_and_missing_coordinates():
    """Verify graceful handling when dataset is empty or coordinates are missing."""
    empty_result = find_hotspots([])
    assert empty_result["hotspots"] == []
    assert empty_result["noise_reports"] == []
    assert "disclaimer" in empty_result

    # Reports with None coordinates should be skipped without error
    reports_no_coords = [
        {"id": 1, "category": "Water Leakage", "status": "Pending", "latitude": None, "longitude": None},
        {"id": 2, "category": "Water Leakage", "status": "Pending", "latitude": None, "longitude": 79.132},
    ]
    no_coords_res = find_hotspots(reports_no_coords)
    assert no_coords_res["hotspots"] == []
    assert no_coords_res["noise_reports"] == []


def test_parameter_validation():
    """Verify invalid parameters raise descriptive ValueError."""
    with pytest.raises(ValueError, match="eps_meters must be a positive number"):
        find_hotspots([], eps_meters=0)

    with pytest.raises(ValueError, match="min_samples must be an integer"):
        find_hotspots([], min_samples=0)

    with pytest.raises(ValueError, match="Invalid time_range"):
        find_hotspots([], time_range="invalid_range")
