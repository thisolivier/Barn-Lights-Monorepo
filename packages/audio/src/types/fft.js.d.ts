/**
 * Type declarations for fft.js library
 * @see https://github.com/nicklockwood/fft.js
 */

declare module 'fft.js' {
  /**
   * FFT constructor
   * @param size - FFT size (must be power of 2)
   */
  export default class FFT {
    constructor(size: number);

    /**
     * Create a complex array for FFT output
     * @returns Float64Array of size 2 * fft_size (interleaved real/imaginary)
     */
    createComplexArray(): number[];

    /**
     * Perform forward FFT on real input data
     * @param output - Output complex array (interleaved real/imaginary)
     * @param input - Input real array
     */
    realTransform(output: number[], input: number[]): void;

    /**
     * Perform forward FFT on complex input data
     * @param output - Output complex array
     * @param input - Input complex array (interleaved real/imaginary)
     */
    transform(output: number[], input: number[]): void;

    /**
     * Perform inverse FFT
     * @param output - Output complex array
     * @param input - Input complex array
     */
    inverseTransform(output: number[], input: number[]): void;

    /**
     * Complete the spectrum from real transform
     * @param spectrum - Complex array from realTransform
     */
    completeSpectrum(spectrum: number[]): void;
  }
}
