CREATE TABLE IF NOT EXISTS analyses (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker                      TEXT    NOT NULL,
    created_at                  TEXT    NOT NULL,
    entry_price                 REAL    NOT NULL,
    overall_rating              TEXT    NOT NULL CHECK (overall_rating IN ('BUY','HOLD','SELL')),
    overall_score               REAL    NOT NULL,
    spike_potential             TEXT    NOT NULL CHECK (spike_potential IN ('low','moderate','high')),
    confidence                  TEXT    NOT NULL,
    thesis                      TEXT    NOT NULL,
    full_json                   TEXT    NOT NULL,
    factor_model                TEXT    NOT NULL,
    synthesis_model             TEXT    NOT NULL,
    total_input_tokens          INTEGER NOT NULL DEFAULT 0,
    total_output_tokens         INTEGER NOT NULL DEFAULT 0,
    total_cache_read_tokens     INTEGER NOT NULL DEFAULT 0,
    total_cache_write_tokens    INTEGER NOT NULL DEFAULT 0,
    total_cost_usd              REAL    NOT NULL DEFAULT 0.0
);

CREATE INDEX IF NOT EXISTS idx_analyses_ticker_created ON analyses(ticker, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analyses_created       ON analyses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analyses_rating        ON analyses(overall_rating);

CREATE TABLE IF NOT EXISTS factor_scores (
    analysis_id     INTEGER NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    factor          TEXT    NOT NULL CHECK (factor IN ('valuation','growth','moat','sentiment','catalysts')),
    score           REAL    NOT NULL,
    rating          TEXT    NOT NULL,
    confidence      TEXT    NOT NULL,
    PRIMARY KEY (analysis_id, factor)
);
CREATE INDEX IF NOT EXISTS idx_factor_scores_factor_score ON factor_scores(factor, score DESC);

CREATE TABLE IF NOT EXISTS performance_snapshots (
    analysis_id             INTEGER NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    interval                TEXT    NOT NULL CHECK (interval IN ('1w','1m','3m','6m','1y')),
    computed_at             TEXT    NOT NULL,
    price_at_interval       REAL,
    return_pct              REAL,
    spy_price_at_analysis   REAL    NOT NULL,
    spy_price_at_interval   REAL,
    spy_return_pct          REAL,
    alpha_pct               REAL,
    PRIMARY KEY (analysis_id, interval)
);
CREATE INDEX IF NOT EXISTS idx_perf_interval ON performance_snapshots(interval);

CREATE TABLE IF NOT EXISTS price_history (
    ticker      TEXT    NOT NULL,
    date        TEXT    NOT NULL,
    open        REAL,
    high        REAL,
    low         REAL,
    close       REAL    NOT NULL,
    adj_close   REAL    NOT NULL,
    volume      INTEGER,
    PRIMARY KEY (ticker, date)
);
CREATE INDEX IF NOT EXISTS idx_price_history_ticker_date ON price_history(ticker, date DESC);

CREATE TABLE IF NOT EXISTS provider_cache (
    key         TEXT    PRIMARY KEY,
    value       TEXT    NOT NULL,
    expires_at  TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_provider_cache_expires ON provider_cache(expires_at);
