"""
Unit and integration tests for get_map_reports_endpoint and get_hotspots_endpoint.
"""

import pytest
from fastapi import HTTPException
from backend.main import get_hotspots_endpoint, get_map_reports_endpoint


def test_map_reports_endpoint():
    result = get_map_reports_endpoint()
    assert "reports" in result
    assert "count" in result
    assert isinstance(result["reports"], list)
    for r in result["reports"]:
        assert r["latitude"] is not None
        assert r["longitude"] is not None


def test_analytics_hotspots_endpoint():
    result = get_hotspots_endpoint()
    assert "hotspots" in result
    assert "noise_reports" in result
    assert "parameters_used" in result
    assert "disclaimer" in result
    assert "Hotspots indicate concentrations" in result["disclaimer"]


def test_hotspots_endpoint_validation():
    # Negative eps_meters should raise HTTPException with status 400
    with pytest.raises(HTTPException) as exc_info:
        get_hotspots_endpoint(eps_meters=-10)
    assert exc_info.value.status_code == 400
    assert "eps_meters must be a positive number" in exc_info.value.detail

    # Invalid time_range should raise HTTPException with status 400
    with pytest.raises(HTTPException) as exc_info2:
        get_hotspots_endpoint(time_range="invalid_window")
    assert exc_info2.value.status_code == 400
    assert "Invalid time_range" in exc_info2.value.detail
