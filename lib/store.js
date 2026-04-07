import {readFile, writeFile, rename, mkdir} from 'node:fs/promises'
import {join, dirname} from 'node:path'

const DATA_DIR = join(process.cwd(), 'data')
const DATA_FILE = join(DATA_DIR, 'delays.json')
const RETENTION_DAYS = 7

async function ensureDir() {
	await mkdir(DATA_DIR, {recursive: true})
}

export async function loadHistory() {
	try {
		const raw = await readFile(DATA_FILE, 'utf-8')
		return JSON.parse(raw)
	} catch (err) {
		if (err.code === 'ENOENT') {
			return {stationId: null, stationName: null, records: []}
		}
		console.error('Warning: could not parse delays.json, starting fresh:', err.message)
		return {stationId: null, stationName: null, records: []}
	}
}

export async function saveHistory(data) {
	await ensureDir()
	const tmp = DATA_FILE + '.tmp'
	await writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8')
	await rename(tmp, DATA_FILE)
}

export async function appendRecord(record, stationId, stationName) {
	const history = await loadHistory()
	history.stationId = stationId
	history.stationName = stationName
	history.records.push(record)

	// Prune records older than retention period
	const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
	history.records = history.records.filter(r => new Date(r.fetchedAt).getTime() > cutoff)

	await saveHistory(history)
}
