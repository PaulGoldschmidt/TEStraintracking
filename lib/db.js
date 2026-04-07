import Database from 'better-sqlite3'
import {mkdirSync} from 'node:fs'
import {join} from 'node:path'

const DATA_DIR = join(process.cwd(), 'data')
const DB_PATH = join(DATA_DIR, 'delays.db')

mkdirSync(DATA_DIR, {recursive: true})

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

db.exec(`
	CREATE TABLE IF NOT EXISTS stations (
		station_id   TEXT PRIMARY KEY,
		station_name TEXT NOT NULL
	);

	CREATE TABLE IF NOT EXISTS departures (
		id            INTEGER PRIMARY KEY AUTOINCREMENT,
		station_id    TEXT    NOT NULL REFERENCES stations(station_id),
		fetched_at    TEXT    NOT NULL,
		trip_id       TEXT    NOT NULL,
		line_name     TEXT    NOT NULL,
		direction     TEXT    NOT NULL DEFAULT '',
		planned_when  TEXT,
		actual_when   TEXT,
		delay_seconds INTEGER,
		delay_minutes INTEGER,
		platform      TEXT,
		cancelled     INTEGER NOT NULL DEFAULT 0
	);

	CREATE INDEX IF NOT EXISTS idx_departures_station_fetched
		ON departures(station_id, fetched_at);

	CREATE INDEX IF NOT EXISTS idx_departures_trip
		ON departures(trip_id, fetched_at);
`)

const upsertStation = db.prepare(`
	INSERT INTO stations (station_id, station_name)
	VALUES (?, ?)
	ON CONFLICT(station_id) DO UPDATE SET station_name = excluded.station_name
`)

const insertDeparture = db.prepare(`
	INSERT INTO departures
	(station_id, fetched_at, trip_id, line_name, direction,
	 planned_when, actual_when, delay_seconds, delay_minutes, platform, cancelled)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const insertAll = db.transaction((record, stationId, stationName) => {
	upsertStation.run(stationId, stationName)
	for (const dep of record.departures) {
		insertDeparture.run(
			stationId,
			record.fetchedAt,
			dep.tripId,
			dep.lineName,
			dep.direction,
			dep.plannedWhen,
			dep.when,
			dep.delay,
			dep.delayMinutes,
			dep.platform,
			dep.cancelled ? 1 : 0
		)
	}
})

export function appendRecord(record, stationId, stationName) {
	insertAll(record, stationId, stationName)
}

export function getHistoryStats(stationId, hours) {
	const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

	return db.prepare(`
		SELECT
			fetched_at AS fetchedAt,
			COUNT(*) AS departureCount,
			SUM(CASE WHEN delay_seconds IS NOT NULL AND delay_seconds > 0 THEN 1 ELSE 0 END) AS delayedCount,
			SUM(cancelled) AS cancelledCount,
			ROUND(AVG(CASE WHEN delay_seconds IS NOT NULL THEN delay_minutes END), 1) AS avgDelayMinutes,
			MAX(CASE WHEN delay_seconds IS NOT NULL THEN delay_minutes END) AS maxDelayMinutes
		FROM departures
		WHERE station_id = ? AND fetched_at >= ?
		GROUP BY fetched_at
		ORDER BY fetched_at
	`).all(stationId, cutoff)
}

export function closeDb() {
	db.close()
}
