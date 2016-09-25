declare const m: Mithril.Static

const DEFAULT_DURATION = 1 * 1000
const RADIUS = 50
const STROKE_WIDTH = 8
const F_STROKE_WIDTH = 1

// in the absense of Pointer events support...
const DEVICE_NONE = 0
const DEVICE_MOUSE = 1
const DEVICE_TOUCH = 2

let device = DEVICE_NONE

interface Vec2 {
	x: number
	y: number
}

//
// LongPresser factory component
//
export default function ({attrs}: Mithril.Vnode) {
	let el: HTMLElement | undefined
	let elSvg: SVGSVGElement | undefined
	let elBgCircle: SVGCircleElement | undefined
	let elFgCircle: SVGCircleElement | undefined
	let elArc: SVGSVGElement | undefined
	let elText: SVGTextElement | undefined
	let elFgText: SVGTextElement | undefined
	const duration: number = (+attrs.duration > 0) ? (+attrs.duration) * 1000 : DEFAULT_DURATION
	const fgStrokeColor: string = attrs.fgStrokeColor
	const bgStrokeColor: string = attrs.bgStrokeColor
	let isPressed = false
	let isFinished = false
	let pressT = 0
	let prevT = Date.now()

	return {
		oncreate ({dom}: Mithril.Vnode) {
			// Grab some elements we'll use a lot
			el = dom as HTMLElement
			elSvg = el.childNodes[0] as SVGSVGElement
			elBgCircle = elSvg.childNodes[0] as SVGCircleElement
			elArc = elSvg.childNodes[1] as SVGSVGElement
			elText = elSvg.childNodes[2] as SVGTextElement
			elFgCircle = elSvg.childNodes[3] as SVGCircleElement
			elFgText = elSvg.childNodes[4] as SVGTextElement

			// Add our own event listeners hidden from Mithril
			el.addEventListener('mousedown', () => {
				if (device !== DEVICE_TOUCH) {
					device = DEVICE_MOUSE
					if (!isPressed) {
						startPress()
					}
				}
			})
			el.addEventListener('mouseup', () => {
				if (device !== DEVICE_TOUCH) {
					device = DEVICE_MOUSE
					if (isPressed) {
						endPress()
					}
				}
			})
			el.addEventListener('touchstart', () => {
				if (device !== DEVICE_MOUSE) {
					device = DEVICE_TOUCH
					if (!isPressed) {
						startPress()
					}
				}
			})
			el.addEventListener('touchend', () => {
				if (device !== DEVICE_MOUSE) {
					device = DEVICE_TOUCH
					if (isPressed) {
						endPress()
					}
				}
			})
		},

		view ({attrs}: Mithril.Vnode) {
			console.log('LongPresser view called')
			return m('div', {class: 'longpresser', style: {cursor: isFinished ? 'default' : 'pointer'}, onpressed: attrs.onpressed},
				m('svg', {viewBox: `0 0 ${RADIUS*2} ${RADIUS*2}`, version: '1.1', xmlns: 'http://www.w3.org/2000/svg'},
					m('circle', {cx: RADIUS, cy: RADIUS, r: RADIUS-STROKE_WIDTH/2, style: {fill: attrs.bgFillColor, stroke: isFinished ? attrs.fgStrokeColor : attrs.bgStrokeColor, strokeWidth: STROKE_WIDTH}}),
					m('path', {d: svgArcPath(RADIUS, RADIUS, RADIUS-STROKE_WIDTH/2, 0, 360.0 * accel(pressT / duration)), style: {fill: 'transparent', stroke: attrs.fgStrokeColor, strokeWidth: STROKE_WIDTH}}),
					m('text', {x: RADIUS, y: RADIUS, style: {textAnchor: 'middle', dominantBaseline: 'middle', fontSize: '0.95em', fill: attrs.textColor}}, attrs.text),
					m('circle', {cx: RADIUS, cy: RADIUS, r: RADIUS-F_STROKE_WIDTH/2, style: {fill: '#EEE', stroke: '#CCC', strokeWidth: F_STROKE_WIDTH, opacity: isFinished ? 1 : 0}}),
					m('text', {x: RADIUS, y: RADIUS, style: {textAnchor: 'middle', dominantBaseline: 'middle', fontSize: '1.5em', fill: '#000', opacity: isFinished ? 1 : 0}}, m.trust('&#10004'))
				)
			)
		}
	}

	// Internally used methods

	function startPress() {
		isPressed = true
		prevT = Date.now()
		requestAnimationFrame(() => {updatePress()})
	}

	function endPress() {
		isPressed = false
	}

	function updatePress() {
		if (!isPressed) {
			updateRelease()
			return
		}
		const t = Date.now()
		const dt = t - prevT
		pressT = Math.min(pressT + dt, duration)
		elArc && drawArc(elArc, accel(pressT / duration))
		prevT = t
		if (pressT >= duration) {
			finish()
			return // cancel the animation loop by exiting here
		}
		// Keep animation running
		requestAnimationFrame(() => {updatePress()})
	}

	function updateRelease() {
		const t = Date.now()
		const dt = t - prevT
		pressT = Math.max(pressT - dt, 0)
		elArc && drawArc(elArc, accel(pressT / duration))
		prevT = t
		if (pressT <= 0) {
			return // cancel the animation loop by exiting here
		}
		// Keep animation running
		// Use updatPress in case isPressed state changes
		requestAnimationFrame(() => {updatePress()})
	}

	function finish() {
		if (!el || !elArc || !elBgCircle) return
		drawArc(elArc, 0)
		el.style.cursor = 'default'
		elBgCircle.style.stroke = fgStrokeColor
		pressT = 0
		isPressed = false
		isFinished = true
		fadeIn(elFgCircle)
		fadeIn(elFgText)
		el.dispatchEvent(new Event('pressed'))
	}

	function reset() {
		if (!el || !elArc || !elBgCircle) return
		isPressed = false
		pressT = 0
		elBgCircle.style.stroke = bgStrokeColor
		el.style.cursor = 'pointer'
		drawArc(elArc, 0)
		isFinished = false
		// Hide the 'finished' elements
		removeFadeIn(elFgCircle)
		removeFadeIn(elFgText)
	}
}


// SVG Arc helper functions (because arcs are otherwise difficult with SVG!)

function polarToCartesian (centerX: number, centerY: number, radius: number, degrees: number, out: Vec2) {
	const r = (degrees-90) * Math.PI / 180.0
	out.x = centerX + (radius * Math.cos(r))
	out.y = centerY + (radius * Math.sin(r))
	return out
}

// Create an SVG arc definition centred at x,y with radius,
// start and end angles (clockwise, in degrees)
const svgArcPath = (function(){
	const _p0 = {x: 0, y: 0}
	const _p1 = {x: 0, y: 0}
	function svgArcPath (x: number, y: number, radius: number, startAngle: number, endAngle: number) {
		polarToCartesian(x, y, radius, endAngle, _p0)
		polarToCartesian(x, y, radius, startAngle, _p1)
		const arcSweep = endAngle - startAngle <= 180 ? '0' : '1'
		return 'M ' + _p0.x + ' ' + _p0.y +
			'A ' + radius + ' ' + radius + ' 0 ' + arcSweep + ' 0 ' + _p1.x + ' ' + _p1.y
	}
	return svgArcPath
}())

/**
 * Draw % of arc
 * @param {HTMLElement} el
 * @param {number} pct
 */
function drawArc (el: SVGSVGElement, pct: number) {
	el.setAttribute('d',
		svgArcPath(
			RADIUS, RADIUS, RADIUS - STROKE_WIDTH / 2, 0, pct * 360
		)
	)
}

/** Non-linear arc motion */
function accel (t: number) {
	return Math.pow(t, 2.25)
}

function fadeIn (el: any) {
	el.style.opacity = '1'
	el.classList.add('longpresser-fade-in')
}

function removeFadeIn (el: any) {
	el.style.opacity = '0'
	el.classList.remove('longpresser-fade-in')
}
