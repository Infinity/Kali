/* Time stretching and pitch shifting in javascript
 * Copyright (c) 2015 Vivek Panyam
 *
 * Based on tempo.c from SoX (copyright 2007 robs@users.sourceforge.net)
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

import TypedQueue = require("./TypedQueue");
 

// aliases
type int = number;
type double = number;
type size_t = number;
type float = number;

// The c code used implicit conversion between floats and ints.
// Since JS stores everything as floats, we need to manually truncate when we
// set a float to an int. A good way to find all these spots is to use the 
// `-Wconversion` flag when compiling the c code.
function handleInt(i: int) {
	return Math.floor(i);
}

// NOTE: JS numbers can't handle 64 bit unsigned ints (without BigInteger or something)
// This is mostly used for sample counters, so it probably doesn't need a 64 bit uint
type uint64_t = number;


class tempo_t {
	public is_initialized: boolean = false;
	public sample_rate: size_t = 44100;
	public channels: size_t = 0;
	public quick_search: boolean = false;
	public factor: double = 0;
	public search: size_t = 0;
	public segment: size_t = 0;
	public overlap: size_t = 0;

	public process_size: size_t = 0;

	/* Buffers */
	public input_fifo: TypedQueue<Float32Array>;
	public overlap_buf: Float32Array; // float pointer
	public output_fifo: TypedQueue<Float32Array>;

	/* Counters */
	public samples_in: uint64_t = 0;
	public samples_out: uint64_t = 0;
	public segments_total: uint64_t = 0;
	public skip_total: uint64_t = 0;
}

class Kali {

	private t: tempo_t;

	/* Waveform Similarity by least squares; works across multi-channels */
	
	// TODO: Optimize by caching?
	private difference(a: Float32Array, b: Float32Array, length: size_t): float {
		var diff : float = 0;
		var i: size_t = 0;

		for (var i = 0; i < length; i++) {
			diff += Math.pow(a[i] - b[i], 2);
		}

		return diff;
	}

	/* Find where the two segments are most alike over the overlap period. */
	private tempo_best_overlap_position(t: tempo_t, new_win: Float32Array) : size_t {
		var f: Float32Array = t.overlap_buf;
		
		var j: size_t;
		var best_pos: size_t;
		
		// NOTE: changed to zero-fill shift
		var prev_best_pos: size_t = (t.search + 1) >>> 1;
		var step: size_t = 64;
		var i: size_t = best_pos = t.quick_search ? prev_best_pos : 0;
		
		var diff: float;
		var least_diff: float = this.difference(new_win.subarray(t.channels * i), f, t.channels * t.overlap);
		var k: int = 0;

		// TODO: implement new quickseek algorithm from SoundTouch
		if (t.quick_search) {
			do { // hierarchial search
				for (k = -1; k <= 1; k += 2) {
					for (j = 1; j < 4 || step == 64; j++) {
						i = prev_best_pos + k * j * step;
						if (i < 0 || i >= t.search) {
							break;
						}

						diff = this.difference(new_win.subarray(t.channels * i), f, t.channels * t.overlap);
						if (diff < least_diff) {
							least_diff = diff;
							best_pos = i;
						}
					}
				}

				prev_best_pos = best_pos;
			} while (step >>>= 2) // NOTE: changed to zero-fill shift
		} else { 
			for (i = 1; i < t.search; i++) { // linear search
				diff = this.difference(new_win.subarray(t.channels * i), f, t.channels * t.overlap);
				if (diff < least_diff) {
					least_diff = diff;
					best_pos = i;
				}
			}
		}

		return best_pos;
	}


	private tempo_overlap(t: tempo_t, in1: Float32Array, in2: Float32Array, output: Float32Array) : void {
		var i: size_t = 0;
		var j: size_t = 0;
		var k: size_t = 0;
		var fade_step: float = 1.0 / t.overlap;

		for (i = 0; i < t.overlap; i++) {
			var fade_in: float = fade_step * i;
			var fade_out: float = 1.0 - fade_in;
			for (j = 0; j < t.channels; j++ , k++) {
				output[k] = in1[k] * fade_out + in2[k] * fade_in;
			}
		}
	}

	public process() : void {
		var t = this.t;
		while (t.input_fifo.occupancy() >= t.process_size) {
			var skip: size_t;
			var offset: size_t;

			/* Copy or overlap the first bit to the output */
			if (!t.segments_total) {
				offset = t.search / 2;
				t.output_fifo.write(t.input_fifo.read_ptr(t.channels * offset, t.overlap), t.overlap);
			} else {
				offset = this.tempo_best_overlap_position(t, t.input_fifo.read_ptr(0));
				this.tempo_overlap(t,
					t.overlap_buf,
					t.input_fifo.read_ptr(t.channels * offset),
					t.output_fifo.write_ptr(t.overlap));
			}

			/* Copy the middle bit to the output */
			t.output_fifo.write(t.input_fifo.read_ptr(t.channels * (offset + t.overlap)),
				t.segment - 2 * t.overlap);

			/* Copy the end bit to overlap_buf ready to be mixed with
		     * the beginning of the next segment. */
			var numToCopy = t.channels * t.overlap;
			t.overlap_buf.set(
				t.input_fifo.read_ptr(t.channels * (offset + t.segment - t.overlap)).subarray(0, numToCopy))

			/* Advance through the input stream */
			t.segments_total++;
			skip = handleInt(t.factor * (t.segment - t.overlap) + 0.5);
			t.input_fifo.read(null, skip);

		}
	}
	
	public input(samples: Float32Array, n :size_t = null, offset = 0) : void {
		if (n == null) {
			n = samples.length;
		}

		var t = this.t;
		t.samples_in += n;
		t.input_fifo.write(samples, n);
	}

	public output(samples: Float32Array) : size_t {
		var t = this.t;
		var n = Math.min(samples.length, t.output_fifo.occupancy());
		t.samples_out += n;
		t.output_fifo.read(samples, n);
		return n;
	}

	public flush(): void {
		var t = this.t;
		var samples_out: uint64_t = handleInt(t.samples_in / t.factor + 0.5);
		var remaining: size_t = samples_out > t.samples_out ? (samples_out - t.samples_out) : 0;
		var buff: Float32Array = new Float32Array(128 * t.channels);

		if (remaining > 0) {
			while(t.output_fifo.occupancy() < remaining) {
				this.input(buff, 128);
				this.process();
			}
			// TODO: trim buffer here
			// Otherwise potential bug if we reuse after a flush
			t.samples_in = 0;
		}
	}

	static segments_ms : double[] = [82, 82, 35, 20];
	static segments_pow: double[] = [0, 1, .33, 1];
	static overlaps_div: double[] = [6.833, 7, 2.5, 2];
	static searches_div: double[] = [5.587, 6, 2.14, 2];

	public setup(sample_rate: double,
				 factor: double, // Factor to change tempo by
				 quick_search: boolean = false,
				 segment_ms: double = null,
				 search_ms: double = null,
				 overlap_ms: double = null): void {

		var profile = 1;
		var t = this.t;
		t.sample_rate = sample_rate;

		if (segment_ms == null) {
			segment_ms = Math.max(10, Kali.segments_ms[profile] / Math.max(Math.pow(factor, Kali.segments_pow[profile]), 1));
		}

		if (search_ms == null) {
			search_ms = segment_ms / Kali.searches_div[profile];
		}

		if (overlap_ms == null) {
			overlap_ms = segment_ms / Kali.overlaps_div[profile];
		}

		var max_skip: size_t;
		t.quick_search = quick_search;
		t.factor = factor;
		t.segment = handleInt(sample_rate * segment_ms / 1000 + .5);
		t.search = handleInt(sample_rate * search_ms / 1000 + .5);
		t.overlap = Math.max(handleInt(sample_rate * overlap_ms / 1000 + 4.5), 16);
		if (t.overlap * 2 > t.segment) {
			t.overlap -= 8;
		}

		if (!t.is_initialized) {
			t.overlap_buf = new Float32Array(t.overlap * t.channels);
		} else {
			var new_overlap = new Float32Array(t.overlap * t.channels);
			var start = 0;
			if (t.overlap * t.channels < t.overlap_buf.length) {
				start = t.overlap_buf.length - (t.overlap * t.channels);
			}

			new_overlap.set(t.overlap_buf.subarray(start, t.overlap_buf.length));
			t.overlap_buf = new_overlap;
		}

		max_skip = handleInt(Math.ceil(factor * (t.segment - t.overlap)));
		t.process_size = Math.max(max_skip + t.overlap, t.segment) + t.search;
		if (!t.is_initialized) {
			t.input_fifo.reserve(handleInt(t.search / 2));
		}

		t.is_initialized = true;
	}

	public setTempo(factor : double) {
		var t = this.t;
		this.setup(t.sample_rate, factor, t.quick_search);
	}

	constructor(channels: size_t) {
		var t: tempo_t = new tempo_t();
		t.channels = channels;
		t.input_fifo = new TypedQueue(Float32Array);
		t.output_fifo = new TypedQueue(Float32Array);
		this.t = t;
	}
}

if (window) {
	window['Kali'] = Kali
}

export = Kali;