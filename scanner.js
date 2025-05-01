// Barcode formats
export const AZTEC = 'aztec';
export const CODE_128 = 'code_128';
export const CODE_39 = 'code_39';
export const CODE_93 = 'code_93';
export const CODEBAR = 'codabar';
export const DATA_MATRIX = 'data_matrix';
export const EAN_13 = 'ean_13';
export const EAN_8 = 'ean_8';
export const ITF = 'itf';
export const PDF417 = 'pdf417';
export const QR_CODE = 'qr_code';
export const UPC_A = 'upc_a';
export const UPC_E = 'upc_e';

export const DEFAULT_BARCODE_FORMATS = [UPC_A, QR_CODE];

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
	osc.frequency.setValueAtTime(frequency, ctx.currentTime); // 1kHz ding
	gain.gain.setValueAtTime(volume, ctx.currentTime); // Adjust volume

	osc.connect(gain);
	gain.connect(ctx.destination);

	osc.start();
	osc.stop(ctx.currentTime + duration); // Short chime
}

export async function createBarcodeReader(callback = console.log, {
	delay = SCAN_DELAY,
	facingMode = FACING_MODE,
	formats = DEFAULT_BARCODE_FORMATS,
	frameRate = FRAME_RATE,
	chimeFrequency = CHIME_FREQUENCY,
	chimeDuration = CHIME_DURATION,
	chimeType = CHIME_TYPE,
	chimeVolume = CHIME_VOLUME,
	errorHandler = reportError,
	signal,
} = {}) {
	const { promise, resolve, reject } = Promise.withResolvers();

	if (! ('BarcodeDetector' in globalThis)) {
		reject(new DOMException('`BarcodeDetector` is not supported.'));
	} else if (signal instanceof AbortSignal && signal.aborted) {
		reject(signal.reason);
	} else {
		let frame = NaN;
		const controller = new AbortController();
		const sig = signal instanceof AbortSignal
			? AbortSignal.any([signal, controller.signal])
			: controller.signal;

		const scanner = new globalThis.BarcodeDetector({ formats });
		const wakeLock = 'wakeLock' in navigator ? await navigator.wakeLock.request('screen').catch(() => undefined) : undefined;
		const video = document.createElement('video');
		const stream = await navigator.mediaDevices.getUserMedia({
			audio: false,
			video: { frameRate, facingMode },
		});

		video.srcObject = stream;
		video.play();

		const canvas = new OffscreenCanvas(640, 480);
		const ctx = canvas.getContext('2d');

		async function drawFrame() {
			try {
				ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

				const results = await scanner.detect(ctx.canvas).catch(err => {
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
			const tracks = stream.getVideoTracks();
			const { width, height } = tracks[0].getSettings();
			target.width = width;
			target.height = height;
			canvas.width = width;
			canvas.height = height;
			resolve({ controller, video, stream, wakeLock });
			drawFrame();
		}, { once: true, signal: sig });

		sig.addEventListener('abort', async () => {
			video.cancelVideoFrameCallback(frame);
			video.pause();
			ctx.reset();
			stream.getTracks().forEach(track => track.stop());

			if (typeof wakeLock === 'object') {
				await wakeLock.release();
			}
		}, { once: true });
	}

	return promise;
}
