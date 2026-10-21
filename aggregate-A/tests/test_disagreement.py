import numpy as np
import pandas as pd

from aggregate_a.validate.disagreement import disagreement_flags
from aggregate_a.validate.sanity import range_summary


def test_direction_conflict_flag():
    idx = pd.bdate_range("2010-01-01", periods=400)
    up = np.exp(np.linspace(0, 1, 400))
    down = np.exp(np.linspace(1, 0, 400))
    est = pd.DataFrame({"a": up * 2, "b": down * 2, "c": np.full(400, 2.0)}, index=idx)
    f = disagreement_flags(est, ["a", "b", "c"], 63, 0.1, 0.9)
    assert f["flag_direction_conflict"].iloc[-1]
    same = pd.DataFrame({"a": up, "b": up * 1.1}, index=idx)
    assert not disagreement_flags(same, ["a", "b"], 63, 0.1, 0.9)["flag_direction_conflict"].any()


def test_range_summary():
    est = pd.DataFrame({"a": [0.5, 2.0, 20.0, -1.0]})
    r = range_summary(est, ["a"], 1, 15).loc["a"]
    assert r["share_below"] == 0.5 and r["share_above"] == 0.25 and r["share_nonpositive"] == 0.25
