// Barcode formats
import { UPC_A, UPC_E, QR_CODE } from './formats.js';
import { BarcodeDetectorPatch, NATIVE_SUPPORT, preloadRxing, preloadRxingModule, preloadRxingWasm } from './rxing.js';

export { NATIVE_SUPPORT, preloadRxing, preloadRxingModule, preloadRxingWasm };
export const DEFAULT_BARCODE_FORMATS = [UPC_A, UPC_E, QR_CODE];

// Scanner config
export const FRAME_RATE = 12;
export const FACING_MODE = 'environment';
export const SCAN_DELAY = 1000;

// Chime config
export const CHIME_FREQUENCY = 1000;
export const CHIME_DURATION = 0.2;
export const CHIME_TYPE = 'sine';
export const CHIME_VOLUME = 0.2;

function playChime({
	frequency = CHIME_FREQUENCY,
	duration = CHIME_DURATION,
	type = CHIME_TYPE,
	volume = CHIME_VOLUME,
} = {}) {
	const ctx = new AudioContext();
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();

	osc.type = type;
	osc.frequency.setValueAtTime(frequency, ctx.currentTime);
	gain.gain.setValueAtTime(volume, ctx.currentTime);

	osc.connect(gain);
	gain.connect(ctx.destination);

	osc.start();
	osc.addEventListener('ended', () => ctx.close(), { once: true });
	osc.stop(ctx.currentTime + duration);
}

const BarcodeDetector = NATIVE_SUPPORT ? globalThis.BarcodeDetector : BarcodeDetectorPatch;

function _getConstraint(val) {
	switch (typeof val) {
		case 'object':
		case 'boolean':
			return val;

		case 'number':
		case 'string':
			return { ideal: val };
	}
}

export async function createBarcodeScanner(callback = console.log, {
	delay = SCAN_DELAY,
	formats = DEFAULT_BARCODE_FORMATS,
	facingMode = { ideal: FACING_MODE },
	frameRate = { ideal: FRAME_RATE },
	chimeFrequency = CHIME_FREQUENCY,
	chimeDuration = CHIME_DURATION,
	chimeType = CHIME_TYPE,
	chimeVolume = CHIME_VOLUME,
	errorHandler = reportError,
	width,
	height,
	signal,
} = {}) {
	const { promise, resolve, reject } = Promise.withResolvers();

	if (signal instanceof AbortSignal && signal.aborted) {
		reject(signal.reason);
	} else {
		let frame = NaN;
		const controller = new AbortController();
		const loadController = new AbortController();
		const sig = signal instanceof AbortSignal
			? AbortSignal.any([signal, controller.signal])
			: controller.signal;

		const scanner = new BarcodeDetector({ formats });
		const video = document.createElement('video');
		const wakeLock = 'wakeLock' in navigator
			? await navigator.wakeLock.request('screen').catch(() => undefined)
			: undefined;

		const stream = await navigator.mediaDevices.getUserMedia({
			audio: false,
			video: {
				frameRate: _getConstraint(frameRate),
				facingMode: _getConstraint(facingMode),
				width: _getConstraint(width),
				height: _getConstraint(height),
			},
		});

		const [track] = stream.getVideoTracks();
		const capture = globalThis?.ImageCapture?.prototype?.grabFrame instanceof Function
			? new ImageCapture(track)
			: undefined;

		video.srcObject = stream;
		video.play();

		async function drawFrame() {
			try {
				const results = await scanner.detect(typeof capture === 'undefined' ? video : await capture.grabFrame()).catch(err => {
					reportError(err);
					return [];
				});

				if (results.length !== 0) {
					playChime({ frequency: chimeFrequency, duration: chimeDuration, type: chimeType, volume: chimeVolume });
					await Promise.allSettled(results.map(callback));
					await new Promise(resolve => setTimeout(resolve, delay));
				}

				if (! sig.aborted) {
					frame = video.requestVideoFrameCallback(drawFrame);
				}
			} catch(err) {
				errorHandler(err);
			}
		}

		video.addEventListener('loadedmetadata', ({ target }) => {
			const { width, height } = track.getSettings();
			target.width = width;
			target.height = height;
			resolve({ controller, video, stream, wakeLock, signal: sig });
			drawFrame();
			loadController.abort();
		}, { once: true, signal: sig });

		video.addEventListener('error', () => {
			const err = new DOMException('Error loading video stream.');
			loadController.abort(err);
			controller.abort(err);
			reject(err);
		}, { once: true, signal: sig });

		sig.addEventListener('abort', async ({ target }) => {
			video.cancelVideoFrameCallback(frame);
			video.pause();
			video.srcObject = null;
			stream.getTracks().forEach(track => track.stop());

			if (typeof wakeLock === 'object') {
				await wakeLock.release();
			}

			if (! loadController.signal.aborted) {
				loadController.abort(target.reason);
			}
		}, { once: true });
	}

	return promise;
}

/**
 * @deprecated
 */
export async function createBarcodeReader(...args) {
	console.warn('`createBarcodeReader` is deprecated and will be removed. It has been renamed to `createBarcodeScanner`.');
	return await createBarcodeScanner.apply(null, args);
}

export * from './formats.js';
