import { createBarcodeScanner } from './scanner.js';

const controller = new AbortController();
const signal = controller.signal;
const btn = document.createElement('button');

const results = await createBarcodeScanner(({ rawValue, format }) => {
	const li = document.createElement('li');
	li.textContent = `[${format}] ${rawValue}`;
	document.getElementById('results').append(li);
}, { frameRate: 24, signal }).catch(err => {
	controller.abort(err);
	reportError(err);
	const li = document.createElement('li');
	li.textContent = err.message;
	document.getElementById('results').append(li);
});

btn.type = 'button';
btn.textContent = 'Stop';
btn.addEventListener('click', ({ currentTarget }) => {
	controller.abort();
	currentTarget.disabled = true;
}, { once: true, signal });

document.body.append(results.video, btn);
