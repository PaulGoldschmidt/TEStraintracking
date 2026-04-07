import {readdirSync, readFileSync} from 'node:fs'
import {join} from 'node:path'
import {appendRecord, closeDb} from '../lib/db.js'

const dataDir = join(process.cwd(), 'data')

let files
try {
	files = readdirSync(dataDir).filter(f => f.startsWith('delays-') && f.endsWith('.json'))
} catch {
	console.log('No data/ directory found. Nothing to migrate.')
	closeDb()
	process.exit(0)
}

if (files.length === 0) {
	console.log('No JSON files found in data/. Nothing to migrate.')
	closeDb()
	process.exit(0)
}

let totalRecords = 0
for (const file of files) {
	const data = JSON.parse(readFileSync(join(dataDir, file), 'utf-8'))
	console.log(`Migrating ${file}: ${data.records.length} records`)
	for (const record of data.records) {
		appendRecord(record, data.stationId, data.stationName)
		totalRecords++
	}
}

console.log(`Migration complete. ${totalRecords} records imported from ${files.length} file(s).`)
closeDb()
