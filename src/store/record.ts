import { Record, cloneRecordIdentity } from '@orbit/records';
import { Dict } from '@orbit/utils';

import {
  JSONOperation,
  isAddRecordJSONOperation,
  isRemoveRecordJSONOperation,
  isUpdateRecordJSONOperation,
  isAddToRelatedRecordsJSONOperation,
  isRemoveFromRelatedRecordsJSONOperation,
  isReplaceRelatedRecordJSONOperation,
} from './operation';
import { unpack } from './hlc';

export type RecordAttributes = Dict<unknown>;

export interface RecordDocument {
  data: Record | null;
  included: Record[];
}

function isRemoved(operations: JSONOperation[]) {
  return (
    operations.length === 0 ||
    operations.find((operation) => isRemoveRecordJSONOperation(operation))
  );
}

function initRecord(record: Record, operation: JSONOperation) {
  if (!record.type) {
    record.type = operation.ref.type;
    record.attributes ||= {};
    record.attributes.createdDate = new Date(
      unpack(operation.meta.timestamp).ts * 1000
    );
    record.relationships ||= {};
  }
}

function assignAttributes(
  record: Record,
  attributes?: RecordAttributes
): Record {
  if (attributes) {
    record.attributes ||= {};
    for (const [key, value] of Object.entries(attributes)) {
      record.attributes[key] = value;
    }
  }
  return record;
}

export function materializeRecord(
  id: string,
  operations: JSONOperation[]
): RecordDocument {
  const operationsById: Dict<JSONOperation[]> = {};
  for (const operation of operations) {
    operationsById[operation.ref.id] ||= [];
    operationsById[operation.ref.id].push(operation);
  }
  if (isRemoved(operationsById[id])) {
    return { data: null, included: [] };
  }
  const included: Record[] = [];
  const data = operationsById[id].reduce(
    (record, operation) => {
      record.attributes ||= {};
      record.relationships ||= {};
      initRecord(record, operation);
      if (isAddRecordJSONOperation(operation)) {
        assignAttributes(record, operation.data.attributes);
      } else if (isUpdateRecordJSONOperation(operation)) {
        assignAttributes(record, operation.data.attributes);
      } else if (isAddToRelatedRecordsJSONOperation(operation)) {
        record.relationships[operation.ref.relationship] ||= { data: [] };
        const records = record.relationships[operation.ref.relationship].data;
        if (Array.isArray(records)) {
          if (operationsById[operation.data.id]) {
            const result = materializeRecord(
              operation.data.id,
              operationsById[operation.data.id]
            );
            if (result.data) {
              included.push(result.data);
              included.push(...result.included);
              records.push(cloneRecordIdentity(result.data));
            }
          } else {
            records.push(cloneRecordIdentity(operation.data));
          }
        }
      } else if (isRemoveFromRelatedRecordsJSONOperation(operation)) {
        const records = record.relationships[operation.ref.relationship].data;
        if (Array.isArray(records)) {
          record.relationships[
            operation.ref.relationship
          ].data = records.filter(({ id }) => id != operation.data.id);
        }
      } else if (isReplaceRelatedRecordJSONOperation(operation)) {
        record.relationships[operation.ref.relationship] ||= { data: null };
        if (operation.data && operationsById[operation.data.id]) {
          const result = materializeRecord(
            operation.data.id,
            operationsById[operation.data.id]
          );
          if (result.data) {
            record.relationships[
              operation.ref.relationship
            ].data = cloneRecordIdentity(result.data);
            included.push(result.data);
            included.push(...result.included);
          } else {
            record.relationships[
              operation.ref.relationship
            ].data = cloneRecordIdentity(operation.data);
          }
        } else if (operation.data) {
          record.relationships[
            operation.ref.relationship
          ].data = cloneRecordIdentity(operation.data);
        } else {
          record.relationships[operation.ref.relationship].data = null;
        }
      }
      return record;
    },
    { id, meta: {}, attributes: {}, relationships: {} } as Record
  );

  return { data, included };
}
