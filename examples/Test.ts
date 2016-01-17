/* Example usage of Kali
 * Copyright (c) 2015 Vivek Panyam
 *
 * This library is free software; you can redistribute it and/or modify it
 * under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation; either version 2.1 of the License, or (at
 * your option) any later version.
 *
 * This library is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU Lesser
 * General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this library; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301  USA
 */

import Kali = require("../src/Kali");

var START_RATE = 1.7;
var TARGET_RATE = 1;

// Load audio
var context = new (AudioContext)();

function loadAudio(url, callback) {
    var request = new XMLHttpRequest();
    request.open('GET', url, true);
    request.responseType = 'arraybuffer';

    request.onload = function() {
        console.log('Loaded:', url);
		context.decodeAudioData(request.response, callback);
    }

    console.log('Loading...', url);
    request.send();
}


function doStretch(inputData : Float32Array, stretchFactor: number, numChannels: number = 1) : Float32Array {
	var numInputFrames = inputData.length / numChannels;
	var bufsize = 4096 * numChannels;

	// Create a Kali instance and initialize it
	var kali = new Kali(numChannels);
	kali.setup(44100, stretchFactor);

	// Create an array for the stretched output. Note if the rate is changing, this array won't be completely full
	var completed = new Float32Array((numInputFrames / Math.min(START_RATE, TARGET_RATE)) * numChannels + 1);

	var inputOffset: number = 0;
	var completedOffset: number = 0;
	var loopCount: number = 0;
	var flushed = false;

	while (completedOffset < completed.length && inputOffset < inputData.length) {
		if (loopCount % 50 == 0) {
			console.log("Stretching", inputOffset  / inputData.length);
			if (stretchFactor > TARGET_RATE) {
				stretchFactor = Math.max(TARGET_RATE, stretchFactor - 0.05);
			} else {
				stretchFactor = Math.min(TARGET_RATE, stretchFactor + 0.05);
			}

			kali.setTempo(stretchFactor);
		}

		// Read stretched samples into our output array
		completedOffset += kali.output(completed.subarray(completedOffset, Math.min(completedOffset + bufsize, completed.length)));
		
		if (inputOffset < inputData.length) { // If we have more data to write, write it
			var dataToInput: Float32Array = inputData.subarray(inputOffset, Math.min(inputOffset + bufsize, inputData.length));
			inputOffset += dataToInput.length;
			
			// Feed Kali samples
			kali.input(dataToInput);
			kali.process();
		} else if (!flushed) { // Flush if we haven't already
			kali.flush();
			flushed = true;
		}

		loopCount++;
	}

	return completed;
}


// Mono stretch
function play() {
	loadAudio('/test.mp3', function(audiobuffer: AudioBuffer) {
		var inputData = audiobuffer.getChannelData(0);
		console.log("Ready to stretch")
		var output = doStretch(inputData, START_RATE);

		var outputAudioBuffer = context.createBuffer(1, output.length, context.sampleRate);
		outputAudioBuffer.getChannelData(0).set(output);

		var source = context.createBufferSource();
		source.buffer = outputAudioBuffer;
		source.connect(context.destination);
		source.start();
	})
}

play();