import { describe, expect, it } from 'vitest';
import { PracticeNavigation } from './practice-navigation';

function gate<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe('current practice view and end decisions', () => {
  it('awaits one inspection pause and reveals the same block without saving it', async () => {
    const navigation = new PracticeNavigation();
    const paused = gate<boolean>();
    const block = { id: 'block-a', seconds: 47, notes: 'Keep this exchange', purpose: 'review' };
    let current = block;
    let page = 'practice';
    let pauses = 0;
    const prepare = () => {
      pauses++;
      return paused.promise;
    };
    const inspect = () =>
      navigation.transition(
        'inspect:today',
        prepare,
        () => {
          page = 'today';
        },
        () => current === block,
      );
    const first = inspect();
    const pairedTraversal = inspect();
    await Promise.resolve();
    expect(pauses).toBe(1);
    expect(page).toBe('practice');
    paused.resolve(true);
    expect(await first).toBe(true);
    expect(await pairedTraversal).toBe(true);
    expect(page).toBe('today');
    expect(current).toBe(block);
    expect(current).toEqual({
      id: 'block-a',
      seconds: 47,
      notes: 'Keep this exchange',
      purpose: 'review',
    });
    expect(
      await navigation.transition(
        'return',
        async () => true,
        () => {
          page = 'practice';
        },
        () => current === block,
      ),
    ).toBe(true);
    expect(pauses).toBe(1);
    expect(current).toBe(block);
    expect(page).toBe('practice');
  });

  it('joins repeated Finish and refuses a competing replacement while its save is uncertain', async () => {
    const navigation = new PracticeNavigation();
    const receipt = gate<boolean>();
    const savedBody = '{"id":"same-finished-result","seconds":47}';
    const submitted: string[] = [];
    let retired = 0;
    let replaced = false;
    const finish = () =>
      navigation.transition(
        'finish',
        () => {
          submitted.push(savedBody);
          return receipt.promise;
        },
        () => {
          retired++;
        },
        () => true,
      );
    const first = finish();
    const second = finish();
    expect(
      await navigation.transition(
        'replace',
        async () => true,
        () => {
          replaced = true;
        },
        () => true,
      ),
    ).toBe(false);
    expect(retired).toBe(0);
    receipt.resolve(true);
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(submitted).toEqual([savedBody]);
    expect(retired).toBe(1);
    expect(replaced).toBe(false);
  });

  it('does not replace the block after a canceled save/discard decision', async () => {
    const navigation = new PracticeNavigation();
    let owner = 'original';
    expect(
      await navigation.transition(
        'replace',
        async () => false,
        () => {
          owner = 'new';
        },
        () => true,
      ),
    ).toBe(false);
    expect(owner).toBe('original');
  });

  it('refuses a different tool or assignment while the first replacement is settling', async () => {
    const navigation = new PracticeNavigation();
    const receipt = gate<boolean>();
    const applied: string[] = [];
    const replacement = navigation.transition(
      'replace:public:runner:assigned',
      () => receipt.promise,
      () => {
        applied.push('runner');
      },
      () => true,
    );
    expect(
      await navigation.transition(
        'replace:task-b:words:review',
        async () => true,
        () => {
          applied.push('words');
        },
        () => true,
      ),
    ).toBe(false);
    receipt.resolve(true);
    expect(await replacement).toBe(true);
    expect(applied).toEqual(['runner']);
  });

  it('invalidates old account work without allowing its completion to clear the new flight', async () => {
    const navigation = new PracticeNavigation();
    const old = gate<boolean>();
    const next = gate<boolean>();
    const applied: string[] = [];
    const oldInspection = navigation.transition(
      'old',
      () => old.promise,
      () => {
        applied.push('old');
      },
      () => true,
    );
    navigation.invalidate();
    const newInspection = navigation.transition(
      'new',
      () => next.promise,
      () => {
        applied.push('new');
      },
      () => true,
    );
    old.resolve(true);
    expect(await oldInspection).toBe(false);
    expect(
      await navigation.transition(
        'competing',
        async () => true,
        () => {
          applied.push('competing');
        },
        () => true,
      ),
    ).toBe(false);
    next.resolve(true);
    expect(await newInspection).toBe(true);
    expect(applied).toEqual(['new']);
  });

  it('checks actual ownership after a delayed pause before changing the view', async () => {
    const navigation = new PracticeNavigation();
    const paused = gate<boolean>();
    let owned = true;
    let revealed = false;
    const result = navigation.transition(
      'inspect',
      () => paused.promise,
      () => {
        revealed = true;
      },
      () => owned,
    );
    owned = false;
    paused.resolve(true);
    expect(await result).toBe(false);
    expect(revealed).toBe(false);
  });

  it('allows a deliberate retry after a failed preparation without applying the failed transition', async () => {
    const navigation = new PracticeNavigation();
    let applied = 0;
    await expect(
      navigation.transition(
        'finish',
        async () => {
          throw new Error('Storage unavailable');
        },
        () => {
          applied++;
        },
        () => true,
      ),
    ).rejects.toThrow('Storage unavailable');
    expect(applied).toBe(0);
    expect(
      await navigation.transition(
        'finish',
        async () => true,
        () => {
          applied++;
        },
        () => true,
      ),
    ).toBe(true);
    expect(applied).toBe(1);
  });
});
