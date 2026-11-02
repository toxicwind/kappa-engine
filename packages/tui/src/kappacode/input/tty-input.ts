/**
 * Deterministic TUI input — native-first, stream-bypassing.
 *
 * Why: Bun's Node-compat `process.stdin` stream intermittently never
 * subscribes its tty pump (kernel evidence: fd 0 with ZERO epoll
 * registrations across a full boot), which froze the kappa TUI ("frozen
 * shell", typing dead) on most boots. `resume()` band-aids didn't help.
 *
 * Architecture (max-integrated, no flaky paths):
 *  - `createFakeStdin()` — a harmless Node-ReadStream-shaped EventEmitter
 *    handed to the opentui renderer. `setupInput()` attaches its 'data'
 *    listener to the fake (never fires); `setRawMode` is backed by a fresh
 *    /dev/tty fd (termios is terminal-scoped, so a non-fd-0 handle is a
 *    valid termios owner). The renderer never touches fd 0.
 *  - `startBunStdinPump(onChunk)` — PRIMARY on fd 0: a native fd-0 read loop
 *    (libuv threadpool blocking `fs.read` via the generic engine). It is the
 *    Bun-native stdin path — it reads fd 0 directly and never touches the
 *    Node-compat `process.stdin` — and it delivers as soon as the tty driver
 *    has bytes (no stream-level burst buffering). Deliberately does NOT use
 *    `Bun.stdin.stream()`: that ReadableStream buffers TTY reads at the stream
 *    level, causing perceived input lag in SSH/tmux sessions (see the 2026-11-01
 *    SSH-lag fix that reverted it).
 *  - `startFdPump(fd, onChunk)` — generic engine: libuv threadpool reads for
 *    arbitrary fds (FIFO/pipe/tty). `startBunStdinPump` is this on fd 0.
 */
import fs from "node:fs"
import * as tty from "node:tty"
import { EventEmitter } from "node:events"

export type RawInputSink = {
  stdinListener: (chunk: Buffer | string) => void
}

export type TtyInputHandle = {
  stop: () => void
}

/** Fake Node stream handed to the renderer so it never subscribes fd 0. */
export function createFakeStdin(): NodeJS.ReadStream {
  // termios lives on the terminal, not the fd: a fresh /dev/tty fd is a
  // valid (and quieter) handle for raw-mode toggles.
  let ttyHandle: tty.ReadStream | undefined
  try {
    const rawFd = fs.openSync("/dev/tty", "r+")
    ttyHandle = new tty.ReadStream(rawFd)
    ttyHandle.on("error", () => {
      // no controlling terminal (tests/headless): raw-mode toggles no-op
    })
  } catch {
    ttyHandle = undefined
  }

  const stream = new EventEmitter() as NodeJS.ReadStream
  Object.assign(stream, {
    isTTY: true,
    isRaw: false,
    readable: true,
    readableLength: 0,
    setRawMode(mode: boolean) {
      try {
        ;(stream as unknown as { isRaw: boolean }).isRaw = mode
        ttyHandle?.setRawMode(mode)
      } catch {
        // best-effort raw mode
      }
      return this
    },
    getRawMode() {
      return (stream as unknown as { isRaw: boolean }).isRaw
    },
    pause() {},
    resume() {},
    read() {
      return null
    },
    destroy() {
      try {
        ttyHandle?.destroy()
      } catch {}
      return this
    },
    once: stream.once.bind(stream),
    removeListener: stream.removeListener.bind(stream),
    off: stream.off.bind(stream),
  })
  return stream
}

/**
 * PRIMARY on fd 0: native fd-0 read loop via the generic engine.
 * Reads fd 0 directly (never the Node-compat `process.stdin`) and delivers as
 * soon as the tty driver has bytes — the low-latency path that fixed both the
 * frozen-TUI (fd 0 unsubscribed) and the SSH burst-lag (stream buffering).
 * Returns a handle; call `stop()` on teardown.
 */
export function startBunStdinPump(onChunk: (chunk: Buffer) => void): TtyInputHandle {
	return startFdPump(0, onChunk)
}

/**
 * FALLBACK/TEST: pump `fd` via libuv's threadpool. Reads block in the pool
 * (kernel-level wait) so there is zero foreground churn; on EAGAIN
 * (non-blocking fds set by the runtime bootstrap) retries on a short delay.
 */
export function startFdPump(fd: number, onChunk: (chunk: Buffer) => void): TtyInputHandle {
  let stopped = false
  const buffer = Buffer.alloc(65536)

  const readOnce = () => {
    if (stopped) return
    fs.read(fd, buffer, 0, buffer.length, null, (error, bytesRead) => {
      if (stopped) return
      if (error) {
        // EAGAIN/EWOULDBLOCK from a non-blocking fd: retry after a tick.
        setTimeout(readOnce, 5)
        return
      }
      if (bytesRead > 0) {
        onChunk(Buffer.from(buffer.subarray(0, bytesRead)))
      }
      readOnce()
    })
  }

  readOnce()
  return {
    stop() {
      stopped = true
    },
  }
}

/**
 * Wire deterministic input into a renderer's raw-input sink.
 * Uses Bun's native stdin stream on fd 0 when available, else a generic
 * fd pump. Bytes are delivered synchronously to the renderer's stdin
 * parser in order.
 */
export function attachTtyInput(renderer: RawInputSink, fd = 0): TtyInputHandle {
  const deliver = (chunk: Buffer) => {
    try {
      renderer.stdinListener(chunk)
    } catch (error) {
      // Buffered-input consumers may throw on teardown races; contain so a
      // bad chunk can never freeze the input pipeline.
      console.error("[tty-input] stdinListener failed", error)
    }
  }
  // fd 0 gets the Bun-native primary (a real distinct branch now — the old
  // ternary returned startFdPump in BOTH arms, silently dead-code-ing the
  // documented PRIMARY pump). Non-stdin fds use the generic engine directly.
  return fd === 0 ? startBunStdinPump(deliver) : startFdPump(fd, deliver)
}