# Kali
Kali is used for realtime time-stretching and pitch shifting in Javascript. It can change Tempo and Pitch independently.

From Wikipedia:
> Time stretching is the process of changing the speed or duration of an audio signal without affecting its pitch. Pitch scaling or pitch shifting is the opposite: the process of changing the pitch without affecting the speed. Similar methods can change speed, pitch, or both at once, in a time-varying way.

Kali uses a WSOLA-like algorithm to do high-quality time stretching in the browser

## Demo
Try a demo [here](http://infinity.github.io/Kali/demo.html).

## Getting Started

Get Kali from the [releases page](https://github.com/Infinity/Kali/releases).

Kali will be published to npm soon.

## Basic Usage
Create a new instance

    var kali = new Kali(numChannels);

Set parameters for time stretching. Setting `useQuickSearch` to true will speed up processing at the expense of some quality. By default, it is set to false. The difference is not noticeable in many cases so try setting it to true if you need more performance.

    kali.setup(sampleRate, stretchFactor, useQuickSearch);

Feed Kali some data and tell it to process. `dataToInput` should be a Float32Array of interlaced samples.

    kali.input(dataToInput);
    kali.process();

Read data out into a target array. `targetArray` should be a Float32Array.

    var samplesRead = kali.output(targetArray);

Once you're done feeding data, tell Kali to flush its buffers and continue reading data.

    kali.flush();

That's it! See `Test.ts` in the examples folder for a complete example of usage.

If you want to change tempo during stretching, you can call `setTempo` (with a new stretch factor) while feeding data. This will let you smoothly change between tempos. See `Test.ts` for an example.

## Documentation

For complete documentation, see [https://kali.readme.io/docs](https://kali.readme.io/docs)

## Efficiency
By using TypedArrays and views on TypedArrays, Kali operates very efficiently. That said, this is an early release and performance hasn't been optimized as much as possible. Pull requests are welcome!

## Running Examples

 - Clone or download this repository
 - Put an mp3 file named `test.mp3` in the `build/examples` directory
 - Start a server in that directory
    - `python -m SimpleHTTPServer`
 - Open your browser and navigate to the test page
    - e.g. `http://localhost:8000/test.html`

The developer console will show the progress of the file being stretched. Once the stretch is complete, the slowed-down version will begin playing. This example slows down a song by 4% (so a 125 bpm song will be slowed down to 120 bpm).

To change this (or anything else about the example), edit `Test.ts` in the `examples` directory and build as shown below.

## Building

    npm install

    // build examples
    webpack --config webpack.config.test.js

    // build Kali
    webpack

    // build minified Kali
    webpack -p

## License
LGPL

Kali is based on ideas and code from [SoundTouch](http://www.surina.net/soundtouch/) and [libsox](http://sox.sourceforge.net/), both of which are LGPL. Therefore, Kali is also LGPL
