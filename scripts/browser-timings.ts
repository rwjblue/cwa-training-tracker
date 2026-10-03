import { mkdirSync, writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

export default class BrowserTimings implements Reporter {
  private attempts: {
    file: string;
    title: string;
    duration: number;
    status: string;
    retry: number;
  }[] = [];

  onTestEnd(test: TestCase, result: TestResult) {
    this.attempts.push({
      file: relative(process.cwd(), test.location.file),
      title: test.title,
      duration: result.duration,
      status: result.status,
      retry: result.retry,
    });
  }

  onEnd(result: FullResult) {
    if (!this.attempts.length) return;
    const slowest = [...this.attempts].sort((a, b) => b.duration - a.duration);
    mkdirSync('.tmp', { recursive: true });
    writeFileSync(
      '.tmp/browser-timings.json',
      JSON.stringify(
        {
          duration: result.duration,
          status: result.status,
          attempts: slowest,
        },
        null,
        2,
      ),
    );
    console.log('\nSlowest browser tests (including retry attempts):');
    for (const test of slowest.slice(0, 10)) {
      console.log(
        `  ${(test.duration / 1000).toFixed(1)}s ${test.file}: ${test.title}${test.retry ? ` (retry ${test.retry})` : ''}`,
      );
    }
    console.log(
      `Browser wall time: ${(result.duration / 1000).toFixed(1)}s; timings: .tmp/browser-timings.json`,
    );
  }
}
