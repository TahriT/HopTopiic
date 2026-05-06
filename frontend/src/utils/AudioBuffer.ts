/**
 * Infer-and-forget rolling audio buffer.
 * Maintains a fixed-size circular buffer of audio chunks.
 * Chunks are processed and then discarded, minimizing memory footprint.
 */

export class AudioBuffer {
  private buffer: ArrayBuffer[] = [];
  private maxChunks: number;
  private chunkDuration: number; // seconds per chunk

  /**
   * @param maxDurationSeconds - Maximum total duration to keep in buffer (e.g., 10 seconds)
   * @param chunkDurationSeconds - Expected duration of each audio chunk (e.g., 0.1 seconds)
   */
  constructor(
    maxDurationSeconds: number = 10,
    chunkDurationSeconds: number = 0.1
  ) {
    this.chunkDuration = chunkDurationSeconds;
    this.maxChunks = Math.ceil(maxDurationSeconds / chunkDurationSeconds);
  }

  /**
   * Add an audio chunk to the buffer.
   * If buffer is full, discard the oldest chunk.
   * Returns the chunk that was discarded (if any).
   */
  addChunk(chunk: ArrayBuffer): ArrayBuffer | null {
    if (this.buffer.length >= this.maxChunks) {
      // Buffer is full: pop the oldest chunk and discard it
      const discarded = this.buffer.shift();
      console.debug(
        `[AudioBuffer] Discarded oldest chunk (${discarded?.byteLength} bytes), buffer size: ${this.buffer.length}`
      );
      this.buffer.push(chunk);
      return discarded || null;
    }

    // Buffer has room: just add
    this.buffer.push(chunk);
    console.debug(
      `[AudioBuffer] Added chunk (${chunk.byteLength} bytes), buffer size: ${this.buffer.length}/${this.maxChunks}`
    );
    return null;
  }

  /**
   * Get all chunks currently in the buffer (concatenated).
   */
  getBuffer(): ArrayBuffer {
    if (this.buffer.length === 0) {
      return new ArrayBuffer(0);
    }

    // Concatenate all chunks
    const totalBytes = this.buffer.reduce((sum, b) => sum + b.byteLength, 0);
    const result = new ArrayBuffer(totalBytes);
    const view = new Uint8Array(result);

    let offset = 0;
    for (const chunk of this.buffer) {
      view.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }

    return result;
  }

  /**
   * Get the number of chunks in the buffer.
   */
  getChunkCount(): number {
    return this.buffer.length;
  }

  /**
   * Estimate current buffer duration in seconds.
   */
  getEstimatedDuration(): number {
    return this.buffer.length * this.chunkDuration;
  }

  /**
   * Clear the buffer.
   */
  clear(): void {
    this.buffer = [];
    console.debug("[AudioBuffer] Cleared");
  }

  /**
   * Get memory usage in bytes.
   */
  getMemoryUsage(): number {
    return this.buffer.reduce((sum, b) => sum + b.byteLength, 0);
  }
}
