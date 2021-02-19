import {
  RecordOperation,
  AddRecordOperation,
  RemoveRecordOperation,
  ReplaceAttributeOperation,
  AddToRelatedRecordsOperation,
  RemoveFromRelatedRecordsOperation,
  cloneRecordIdentity,
} from '@orbit/records';

export interface EntityRef {
  type: string;
  id: string;
}

export interface RelationshipRef {
  type: string;
  id: string;
  relationship: string;
}

export interface OperationMeta {
  id: string;
  timestamp: string;
  sync?: string;
}

export interface AddRecordJSONOperation {
  op: 'add';
  ref: EntityRef;
  data: {
    attributes?: Record<string, unknown>;
  };
  meta: OperationMeta;
}

export interface RemoveRecordJSONOperation {
  op: 'remove';
  ref: EntityRef;
  meta: OperationMeta;
}

export interface UpdateRecordJSONOperation {
  op: 'update';
  ref: EntityRef;
  data: {
    attributes: Record<string, unknown>;
  };
  meta: OperationMeta;
}

export interface AddToRelatedRecordsJSONOperation {
  op: 'add';
  ref: RelationshipRef;
  data: {
    id: string;
    type: string;
  };
  meta: OperationMeta;
}

export interface RemoveFromRelatedRecordsJSONOperation {
  op: 'remove';
  ref: RelationshipRef;
  data: {
    id: string;
    type: string;
  };
  meta: OperationMeta;
}

export interface ReplaceRelatedRecordJSONOperation {
  op: 'update';
  ref: RelationshipRef;
  data: {
    id: string;
    type: string;
  } | null;
  meta: OperationMeta;
}

export type JSONOperation =
  | AddRecordJSONOperation
  | RemoveRecordJSONOperation
  | UpdateRecordJSONOperation
  | AddToRelatedRecordsJSONOperation
  | RemoveFromRelatedRecordsJSONOperation
  | ReplaceRelatedRecordJSONOperation;

export function isAddRecordJSONOperation(
  operation: JSONOperation
): operation is AddRecordJSONOperation {
  return operation.op === 'add' && !(operation.ref as any).relationship;
}

export function isRemoveRecordJSONOperation(
  operation: JSONOperation
): operation is RemoveRecordJSONOperation {
  return operation.op === 'remove' && !(operation.ref as any).relationship;
}

export function isUpdateRecordJSONOperation(
  operation: JSONOperation
): operation is UpdateRecordJSONOperation {
  return operation.op === 'update' && !(operation.ref as any).relationship;
}

export function isAddToRelatedRecordsJSONOperation(
  operation: JSONOperation
): operation is AddToRelatedRecordsJSONOperation {
  return operation.op === 'add' && !!(operation.ref as any).relationship;
}

export function isRemoveFromRelatedRecordsJSONOperation(
  operation: JSONOperation
): operation is RemoveFromRelatedRecordsJSONOperation {
  return operation.op === 'remove' && !!(operation.ref as any).relationship;
}

export function isReplaceRelatedRecordJSONOperation(
  operation: JSONOperation
): operation is ReplaceRelatedRecordJSONOperation {
  return operation.op === 'update' && !!(operation.ref as any).relationship;
}

export function toRecordOperation(
  operations: JSONOperation[]
): RecordOperation[] {
  return operations.map((operation) => {
    if (isAddToRelatedRecordsJSONOperation(operation)) {
      return {
        op: 'addToRelatedRecords',
        record: cloneRecordIdentity(operation.ref),
        relationship: operation.ref.relationship,
        relatedRecord: operation.data,
      } as AddToRelatedRecordsOperation;
    } else if (isRemoveFromRelatedRecordsJSONOperation(operation)) {
      return {
        op: 'removeFromRelatedRecords',
        record: cloneRecordIdentity(operation.ref),
        relationship: operation.ref.relationship,
        relatedRecord: operation.data,
      } as RemoveFromRelatedRecordsOperation;
    } else if (isAddRecordJSONOperation(operation)) {
      return {
        op: 'addRecord',
        record: {
          ...cloneRecordIdentity(operation.ref),
          attributes: operation.data.attributes,
        },
      } as AddRecordOperation;
    } else if (isRemoveRecordJSONOperation(operation)) {
      return {
        op: 'removeRecord',
        record: cloneRecordIdentity(operation.ref),
      } as RemoveRecordOperation;
    } else if (isUpdateRecordJSONOperation(operation)) {
      const attributes = Object.entries(operation.data.attributes)[0];
      return {
        op: 'replaceAttribute',
        record: cloneRecordIdentity(operation.ref),
        attribute: attributes[0],
        value: attributes[1],
      } as ReplaceAttributeOperation;
    }
    throw new Error('Unsuported operation');
  });
}

export function toJSONOperation(
  operations: RecordOperation[]
): JSONOperation[] {
  const jsonOperations: JSONOperation[] = [];
  for (const operation of operations) {
    switch (operation.op) {
      case 'addRecord':
        const [firstAttribute, ...attributes] = Object.entries(
          operation.record.attributes ?? {}
        );
        jsonOperations.push({
          op: 'add',
          ref: cloneRecordIdentity(operation.record),
          data: {
            attributes: {
              ...(firstAttribute
                ? { [firstAttribute[0]]: firstAttribute[1] }
                : undefined),
            },
          },
        } as AddRecordJSONOperation);
        for (const [attribute, value] of attributes) {
          jsonOperations.push({
            op: 'update',
            ref: cloneRecordIdentity(operation.record),
            data: {
              attributes: {
                [attribute]: value,
              },
            },
          } as UpdateRecordJSONOperation);
        }
        break;
      case 'updateRecord':
        for (const [attribute, value] of Object.entries(
          operation.record.attributes ?? {}
        )) {
          jsonOperations.push({
            op: 'update',
            ref: cloneRecordIdentity(operation.record),
            data: {
              attributes: {
                [attribute]: value,
              },
            },
          } as UpdateRecordJSONOperation);
        }
        break;
      case 'replaceAttribute':
        jsonOperations.push({
          op: 'update',
          ref: cloneRecordIdentity(operation.record),
          data: {
            attributes: {
              [operation.attribute]: operation.value,
            },
          },
        } as UpdateRecordJSONOperation);
        break;
      case 'removeRecord':
        jsonOperations.push({
          op: 'remove',
          ref: cloneRecordIdentity(operation.record),
        } as RemoveRecordJSONOperation);
        break;
      case 'addToRelatedRecords':
        jsonOperations.push({
          op: 'add',
          ref: {
            ...cloneRecordIdentity(operation.record),
            relationship: operation.relationship,
          },
          data: operation.relatedRecord,
        } as AddToRelatedRecordsJSONOperation);
        break;
      case 'removeFromRelatedRecords':
        jsonOperations.push({
          op: 'remove',
          ref: {
            ...cloneRecordIdentity(operation.record),
            relationship: operation.relationship,
          },
          data: operation.relatedRecord,
        } as RemoveFromRelatedRecordsJSONOperation);
        break;
    }
  }
  return jsonOperations;
}
