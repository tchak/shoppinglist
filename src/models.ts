import { RecordSchema } from '@orbit/records';
import { Model } from './store';

export class Item extends Model {
  static modelName = 'item';

  get title(): string {
    return this.getAttribute('title') ?? '';
  }

  get note(): string {
    return this.getAttribute('note') ?? '';
  }

  get checked(): boolean {
    return this.getAttribute('checked') ?? false;
  }

  get createdDate(): Date | undefined {
    return this.getAttribute('createdDate');
  }
}

export class List extends Model {
  static modelName = 'list';

  get title(): string {
    return this.getAttribute('title') ?? '';
  }

  get createdDate(): Date | undefined {
    return this.getAttribute('createdDate');
  }

  get items(): Item[] {
    return this.getRelatedRecords(
      'items',
      (identity, source) => new Item(identity, source)
    );
  }
}

export const schema = new RecordSchema({
  models: {
    list: {
      attributes: {
        title: { type: 'string' },
      },
      relationships: {
        items: {
          kind: 'hasMany',
          type: 'item',
          inverse: 'list',
        },
      },
    },
    item: {
      attributes: {
        title: { type: 'string' },
        note: { type: 'string' },
        checked: { type: 'boolean' },
      },
      relationships: {
        list: {
          kind: 'hasOne',
          type: 'list',
          inverse: 'items',
        },
      },
    },
  },
});
