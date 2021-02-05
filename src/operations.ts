export type ID = string;

export interface EntityRef {
  type: string;
  id: ID;
}

export interface RelationshipRef {
  type: string;
  id: ID;
  relationship: string;
}

export type OperationRef = EntityRef | RelationshipRef;

export interface OperationMeta {
  id: ID;
  timestamp: string;
  sync?: string;
}

export interface AddEntityOperation {
  op: 'add';
  ref: EntityRef;
  data: {
    attributes?: Record<string, unknown>;
  };
  meta: OperationMeta;
}

export interface RemoveEntityOperation {
  op: 'remove';
  ref: EntityRef;
  meta: OperationMeta;
}

export interface UpdateEntityOperation {
  op: 'update';
  ref: EntityRef;
  data: {
    attributes: Record<string, unknown>;
  };
  meta: OperationMeta;
}

export interface AddToHasManyOperation {
  op: 'add';
  ref: RelationshipRef;
  data: {
    id: ID;
    type: string;
  };
  meta: OperationMeta;
}

export interface RemoveFromHasManyOperation {
  op: 'remove';
  ref: RelationshipRef;
  data: {
    id: ID;
    type: string;
  };
  meta: OperationMeta;
}

export interface ReplaceHasOneOperation {
  op: 'update';
  ref: RelationshipRef;
  data: {
    id: ID;
    type: string;
  } | null;
  meta: OperationMeta;
}

export type Operation =
  | AddEntityOperation
  | RemoveEntityOperation
  | UpdateEntityOperation
  | AddToHasManyOperation
  | RemoveFromHasManyOperation
  | ReplaceHasOneOperation;

export function isAddEntityOperation(
  operation: Operation
): operation is AddEntityOperation {
  return operation.op === 'add' && !(operation.ref as any).relationship;
}

export function isRemoveEntityOperation(
  operation: Operation
): operation is RemoveEntityOperation {
  return operation.op === 'remove' && !(operation.ref as any).relationship;
}

export function isUpdateEntityOperation(
  operation: Operation
): operation is UpdateEntityOperation {
  return operation.op === 'update' && !(operation.ref as any).relationship;
}

export function isAddToHasManyOperation(
  operation: Operation
): operation is AddToHasManyOperation {
  return operation.op === 'add' && !!(operation.ref as any).relationship;
}

export function isRemoveFromHasManyOperation(
  operation: Operation
): operation is RemoveFromHasManyOperation {
  return operation.op === 'remove' && !!(operation.ref as any).relationship;
}

export function isReplaceHasOneOperation(
  operation: Operation
): operation is ReplaceHasOneOperation {
  return operation.op === 'update' && !!(operation.ref as any).relationship;
}
