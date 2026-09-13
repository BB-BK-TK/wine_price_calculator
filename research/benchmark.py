import json, re
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import spearmanr
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

DATA_URL = "https://raw.githubusercontent.com/morisasy/kaggle/master/data/winemag-data-130k-v2.csv"
OUT = Path(__file__).parent / "results.json"
RANDOM_STATE = 42


def parse_vintage(title):
    m = re.search(r"\b(19\d{2}|20\d{2})\b", str(title))
    return float(m.group(1)) if m else np.nan


def clean(df):
    df = df.copy()
    df = df[df["price"].notna() & (df["price"] > 0)].copy()
    df["vintage"] = df["title"].map(parse_vintage)
    df = df.drop_duplicates(subset=["title", "price", "points", "winery", "variety", "province", "region_1"])
    lo, hi = df["price"].quantile([0.005, 0.995])
    df = df[df["price"].between(lo, hi)].copy()
    return df


def metrics(y, pred):
    return {
        "n": int(len(y)),
        "mae_usd": round(float(mean_absolute_error(y, pred)), 3),
        "rmse_usd": round(float(mean_squared_error(y, pred) ** 0.5), 3),
        "median_ape": round(float(np.median(np.abs(pred - y) / y)), 4),
        "spearman": round(float(spearmanr(y, pred).statistic), 4),
    }


def segment_median(train, test):
    global_med = float(train.price.median())
    levels = [["country", "province", "variety"], ["country", "variety"], ["country"]]
    pred = pd.Series(np.nan, index=test.index, dtype=float)
    for cols in levels:
        keys = pd.MultiIndex.from_frame(test[cols].fillna("__NA__"))
        med2 = train.assign(**{c: train[c].fillna("__NA__") for c in cols}).groupby(cols).price.median()
        vals = med2.reindex(keys).to_numpy()
        pred = pred.fillna(pd.Series(vals, index=test.index))
    return pred.fillna(global_med).to_numpy()


def comparable_binned_median(train, test):
    """Comparable-first baseline using structured peer cells with hierarchical fallback."""
    tr = train.copy()
    te = test.copy()
    tr["points_bin"] = (tr["points"] // 2 * 2).astype("Int64")
    te["points_bin"] = (te["points"] // 2 * 2).astype("Int64")
    tr["vintage_bin"] = (tr["vintage"] // 5 * 5).astype("Int64")
    te["vintage_bin"] = (te["vintage"] // 5 * 5).astype("Int64")

    global_med = float(tr.price.median())
    levels = [
        ["country", "province", "region_1", "variety", "points_bin", "vintage_bin"],
        ["country", "province", "variety", "points_bin", "vintage_bin"],
        ["country", "province", "variety", "points_bin"],
        ["country", "province", "variety"],
        ["country", "variety", "points_bin"],
        ["country", "variety"],
        ["country"],
    ]

    pred = pd.Series(np.nan, index=te.index, dtype=float)
    for cols in levels:
        tr_keyed = tr.assign(**{c: tr[c].astype("string").fillna("__NA__") for c in cols})
        te_keyed = te.assign(**{c: te[c].astype("string").fillna("__NA__") for c in cols})
        med = tr_keyed.groupby(cols, dropna=False).price.median()
        keys = pd.MultiIndex.from_frame(te_keyed[cols])
        vals = med.reindex(keys).to_numpy()
        pred = pred.fillna(pd.Series(vals, index=te.index))
    return pred.fillna(global_med).to_numpy()


def ridge_model(include_winery):
    numeric = ["points", "vintage"]
    cats = ["country", "province", "region_1", "variety"] + (["winery"] if include_winery else [])
    pre = ColumnTransformer([
        ("num", Pipeline([("imp", SimpleImputer(strategy="median")), ("scale", StandardScaler())]), numeric),
        ("cat", Pipeline([("imp", SimpleImputer(strategy="most_frequent")), ("oh", OneHotEncoder(handle_unknown="ignore", min_frequency=5))]), cats),
    ])
    return Pipeline([("pre", pre), ("model", Ridge(alpha=8.0))])


def fit_predict(train, test, include_winery):
    feats = ["points", "vintage", "country", "province", "region_1", "variety"] + (["winery"] if include_winery else [])
    m = ridge_model(include_winery)
    m.fit(train[feats], np.log1p(train.price))
    return np.expm1(m.predict(test[feats]))


def evaluate_split(name, train, test):
    out = {"split": name, "train_n": int(len(train)), "test_n": int(len(test))}
    global_pred = np.repeat(float(train.price.median()), len(test))
    out["B0_global_median"] = metrics(test.price.to_numpy(), global_pred)
    out["B1_segment_median"] = metrics(test.price.to_numpy(), segment_median(train, test))
    out["B2_hedonic_no_producer"] = metrics(test.price.to_numpy(), fit_predict(train, test, False))
    out["B3_hedonic_plus_producer"] = metrics(test.price.to_numpy(), fit_predict(train, test, True))
    out["B4_comparable_binned_median"] = metrics(test.price.to_numpy(), comparable_binned_median(train, test))
    return out


def main():
    raw = pd.read_csv(DATA_URL)
    d = clean(raw)
    rng = np.random.default_rng(RANDOM_STATE)

    mask = rng.random(len(d)) < 0.2
    random_test = d.loc[mask]
    random_train = d.loc[~mask]

    gss = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=RANDOM_STATE)
    tr_idx, te_idx = next(gss.split(d, groups=d["winery"].fillna("__NA__")))
    producer_train, producer_test = d.iloc[tr_idx], d.iloc[te_idx]

    vint = d["vintage"].dropna()
    cutoff = float(vint.quantile(0.8))
    forward_train = d[(d.vintage.notna()) & (d.vintage < cutoff)]
    forward_test = d[(d.vintage.notna()) & (d.vintage >= cutoff)]

    results = {
        "dataset": {
            "source": DATA_URL,
            "raw_n": int(len(raw)),
            "clean_n": int(len(d)),
            "target_interpretation": "Wine Enthusiast listed/review price proxy; useful for retail-price modelling structure, not current secondary-market or auction truth.",
            "limitations": [
                "No transaction timestamps, bids, hammer prices, inventory depth or condition/provenance.",
                "Bottle format is not reliably structured; residual size/format contamination may remain.",
                "Vintage-forward split is not a market-time split.",
                "Producer holdout intentionally removes same-winery memorisation and is expected to be harder.",
                "B4 comparables are structured peer cells, not live exact-wine merchant/transaction comparables.",
            ],
        },
        "random_holdout": evaluate_split("random_holdout", random_train, random_test),
        "producer_holdout": evaluate_split("producer_holdout", producer_train, producer_test),
        "vintage_forward_holdout": evaluate_split("vintage_forward_holdout", forward_train, forward_test),
    }
    OUT.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
