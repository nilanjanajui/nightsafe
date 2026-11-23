from __future__ import annotations

from nsd.gps import parse_cgpsinf


def test_parse_cgpsinf_samples():
    """Test parse of CGPSINF samples: normal, swapped lat/lon, garbage."""
    # 1. Normal format with N/E hemisphere
    # 2221.4140 -> 22 deg 21.414 min = 22.3569
    # 09146.9920 -> 91 deg 46.992 min = 91.7832
    raw_normal = "+CGPSINF: 0,2221.414000,N,09146.992000,E,20261123,042238.000,35.2,0.0,0.0"
    res_normal = parse_cgpsinf(raw_normal)
    assert res_normal is not None
    assert abs(res_normal["latitude"] - 22.3569) < 0.001
    assert abs(res_normal["longitude"] - 91.7832) < 0.001

    # 2. Swapped format (lon before lat)
    raw_swapped = "+CGPSINF: 0,09146.992000,E,2221.414000,N,20261123,042238.000,35.2,0.0,0.0"
    res_swapped = parse_cgpsinf(raw_swapped)
    assert res_swapped is not None
    assert abs(res_swapped["latitude"] - 22.3569) < 0.001
    assert abs(res_swapped["longitude"] - 91.7832) < 0.001

    # 3. Direct decimal format (normal)
    raw_decimal = "+CGPSINF: 0,22.356900,91.783200,35.2,0.0,0.0"
    res_decimal = parse_cgpsinf(raw_decimal)
    assert res_decimal is not None
    assert abs(res_decimal["latitude"] - 22.3569) < 0.001
    assert abs(res_decimal["longitude"] - 91.7832) < 0.001

    # 4. Garbage samples
    assert parse_cgpsinf("") is None
    assert parse_cgpsinf("AT+CGPSINF=0\r\nERROR\r\n") is None
    assert parse_cgpsinf("+CGPSINF: 0,0.000000,0.000000,0.0,0.0") is None  # Null Island rejected
    assert parse_cgpsinf("+CGPSINF: 0,INVALID,DATA,XYZ") is None

