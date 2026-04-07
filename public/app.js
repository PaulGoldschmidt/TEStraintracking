const STATUS_INTERVAL = 30_000
const HISTORY_INTERVAL = 300_000

const $ = (id) => document.getElementById(id)

let stations = []
let selectedStationId = null

function formatTime(iso) {
	if (!iso) return '--'
	return new Date(iso).toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'})
}

function timeAgo(iso) {
	if (!iso) return '--'
	const diff = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
	if (diff < 60) return `${diff}s ago`
	if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
	return `${Math.floor(diff / 3600)}h ago`
}

function delayClass(minutes) {
	if (minutes === null || minutes === undefined) return 'unknown'
	if (minutes <= 0) return 'on-time'
	if (minutes <= 5) return 'delayed'
	return 'very-delayed'
}

function delayText(dep) {
	if (dep.cancelled) return 'Cancelled'
	if (dep.delayMinutes === null || dep.delayMinutes === undefined) return 'No data'
	if (dep.delayMinutes <= 0) return 'On time'
	return `+${dep.delayMinutes} min`
}

function statusColor(summary) {
	if (!summary || summary.totalDepartures === 0) return 'grey'
	if (summary.cancelled > 0) return 'red'
	if (summary.maxDelayMinutes !== null && summary.maxDelayMinutes > 5) return 'red'
	if (summary.maxDelayMinutes !== null && summary.maxDelayMinutes > 0) return 'amber'
	return 'green'
}

function statusText(summary) {
	if (!summary || summary.totalDepartures === 0) return 'No departures'
	if (summary.cancelled > 0) return 'Cancellations'
	if (summary.maxDelayMinutes !== null && summary.maxDelayMinutes > 5) return 'Major delays'
	if (summary.maxDelayMinutes !== null && summary.maxDelayMinutes > 0) return 'Minor delays'
	return 'On time'
}

function renderStationTabs() {
	const container = $('stationTabs')
	container.innerHTML = ''
	for (const s of stations) {
		const btn = document.createElement('button')
		btn.className = 'station-tab' + (s.id === selectedStationId ? ' active' : '')
		btn.textContent = s.name
		btn.addEventListener('click', () => selectStation(s.id))
		container.appendChild(btn)
	}
}

function selectStation(stationId) {
	selectedStationId = stationId
	renderStationTabs()
	// Save selection to URL hash
	location.hash = stationId
	// Fetch immediately for the new station
	fetchStatus()
	fetchHistory()
}

function renderStatus(data) {
	const dot = $('statusDot')
	dot.className = 'status-dot ' + statusColor(data.summary)

	$('statusText').textContent = statusText(data.summary)
	$('lastUpdated').textContent = timeAgo(data.fetchedAt)

	if (data.summary && data.summary.totalDepartures > 0) {
		const parts = []
		parts.push(`${data.summary.totalDepartures} departure(s)`)
		if (data.summary.avgDelayMinutes !== null) {
			parts.push(`avg ${data.summary.avgDelayMinutes} min delay`)
		}
		$('statusSummary').textContent = parts.join(' \u00b7 ')
	} else {
		$('statusSummary').textContent = 'No TES departures found'
	}

	renderDepartures(data.departures || [])
}

function renderDepartures(departures) {
	const container = $('departuresContent')
	if (departures.length === 0) {
		container.innerHTML = '<div class="empty-state">No upcoming TES departures at this time</div>'
		return
	}

	let html = `<table>
		<thead><tr>
			<th>Line</th>
			<th>Direction</th>
			<th>Planned</th>
			<th>Expected</th>
			<th>Delay</th>
		</tr></thead><tbody>`

	for (const dep of departures) {
		const cls = dep.cancelled ? ' class="cancelled-row"' : ''
		const badge = delayClass(dep.cancelled ? null : dep.delayMinutes)
		html += `<tr${cls}>
			<td><strong>${esc(dep.lineName)}</strong></td>
			<td>${esc(dep.direction)}</td>
			<td>${formatTime(dep.plannedWhen)}</td>
			<td>${dep.cancelled ? '--' : formatTime(dep.when)}</td>
			<td><span class="delay-badge ${dep.cancelled ? 'cancelled' : badge}">${delayText(dep)}</span></td>
		</tr>`
	}

	html += '</tbody></table>'
	container.innerHTML = html
}

function renderHistory(data) {
	const records = data.records || []
	$('statPolls').textContent = records.length

	if (records.length === 0) {
		$('statOnTime').textContent = '--'
		$('statAvgDelay').textContent = '--'
		$('statMaxDelay').textContent = '--'
		$('chart').innerHTML = '<div class="empty-state">No history data yet</div>'
		return
	}

	const withDeps = records.filter(r => r.departureCount > 0)
	const onTimeCount = withDeps.filter(r => r.maxDelayMinutes !== null && r.maxDelayMinutes <= 0).length
	const onTimePct = withDeps.length > 0 ? Math.round((onTimeCount / withDeps.length) * 100) : '--'
	$('statOnTime').textContent = onTimePct === '--' ? '--' : `${onTimePct}%`

	const avgDelays = withDeps.filter(r => r.avgDelayMinutes !== null).map(r => r.avgDelayMinutes)
	const overallAvg = avgDelays.length > 0 ? Math.round((avgDelays.reduce((a, b) => a + b, 0) / avgDelays.length) * 10) / 10 : null
	$('statAvgDelay').textContent = overallAvg !== null ? `${overallAvg}m` : '--'

	const maxDelays = withDeps.filter(r => r.maxDelayMinutes !== null).map(r => r.maxDelayMinutes)
	const overallMax = maxDelays.length > 0 ? Math.max(...maxDelays) : null
	$('statMaxDelay').textContent = overallMax !== null ? `${overallMax}m` : '--'

	// Chart
	const chartMax = Math.max(5, overallMax || 5)
	const chart = $('chart')
	chart.innerHTML = ''

	// Show at most 120 bars
	const step = Math.max(1, Math.floor(records.length / 120))
	const sampled = records.filter((_, i) => i % step === 0)

	for (const r of sampled) {
		const bar = document.createElement('div')
		bar.className = 'chart-bar'
		const val = r.avgDelayMinutes != null ? r.avgDelayMinutes : 0
		const pct = Math.max(2, (val / chartMax) * 100)
		bar.style.height = `${pct}%`

		if (val > 5) bar.classList.add('red')
		else if (val > 0) bar.classList.add('amber')
		else bar.classList.add('green')

		bar.title = `${formatTime(r.fetchedAt)}: avg ${val}m delay (${r.departureCount} dep.)`
		chart.appendChild(bar)
	}

	if (records.length > 0) {
		$('chartStart').textContent = formatTime(records[0].fetchedAt)
	}
}

function esc(str) {
	const d = document.createElement('div')
	d.textContent = str
	return d.innerHTML
}

async function fetchStatus() {
	if (!selectedStationId) return
	try {
		const res = await fetch(`/api/status?station=${encodeURIComponent(selectedStationId)}`)
		if (!res.ok) throw new Error('Not OK')
		const data = await res.json()
		renderStatus(data)
		$('connectionBanner').style.display = 'none'
	} catch {
		$('connectionBanner').style.display = 'block'
	}
}

async function fetchHistory() {
	if (!selectedStationId) return
	try {
		const res = await fetch(`/api/history?station=${encodeURIComponent(selectedStationId)}&hours=24`)
		if (!res.ok) throw new Error('Not OK')
		const data = await res.json()
		renderHistory(data)
	} catch {
		// Silently retry next interval
	}
}

async function init() {
	try {
		const res = await fetch('/api/stations')
		stations = await res.json()
	} catch {
		$('connectionBanner').style.display = 'block'
		return
	}

	if (stations.length === 0) return

	// Restore selection from URL hash, or default to first station
	const hashId = location.hash.slice(1)
	if (hashId && stations.some(s => s.id === hashId)) {
		selectedStationId = hashId
	} else {
		selectedStationId = stations[0].id
	}

	renderStationTabs()
	fetchStatus()
	fetchHistory()

	setInterval(fetchStatus, STATUS_INTERVAL)
	setInterval(fetchHistory, HISTORY_INTERVAL)
}

init()
