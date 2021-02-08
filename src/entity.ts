import {
  ID,
  Operation,
  isAddEntityOperation,
  isRemoveEntityOperation,
  isUpdateEntityOperation,
  isAddToHasManyOperation,
  isRemoveFromHasManyOperation,
  isReplaceHasOneOperation,
} from './operations';
import { unpack } from './hlc';

export type Identifier = { type: string; id: ID };
export type Attributes = Record<string, unknown>;
export type Entity = Identifier & { createdDate: Date } & Record<
    string,
    unknown | Entity[]
  >;
export type EntityLink = [Entity, string, Entity];

function isRemoved(operations: Operation[]) {
  return (
    operations.length === 0 ||
    operations.find((operation) => isRemoveEntityOperation(operation))
  );
}

function assignAttributes(entity: Entity, attributes?: Attributes): Entity {
  if (attributes) {
    for (const [key, value] of Object.entries(attributes)) {
      entity[key] = value;
    }
  }
  return entity;
}

export function materializeEntity(
  id: ID,
  operations: Operation[]
): Entity | null {
  const operationsById: Record<ID, Operation[]> = {};
  for (const operation of operations) {
    operationsById[operation.ref.id] ||= [];
    operationsById[operation.ref.id].push(operation);
  }
  if (isRemoved(operationsById[id])) {
    return null;
  }
  return operationsById[id].reduce(
    (entity, operation) => {
      if (isAddEntityOperation(operation)) {
        entity.type = operation.ref.type;
        entity.createdDate = new Date(
          unpack(operation.meta.timestamp).ts * 1000
        );
        assignAttributes(entity, operation.data.attributes);
      } else if (isUpdateEntityOperation(operation)) {
        assignAttributes(entity, operation.data.attributes);
      } else if (isAddToHasManyOperation(operation)) {
        if (operationsById[operation.data.id]) {
          entity[operation.ref.relationship] ||= [];
          const entities = entity[operation.ref.relationship];
          if (Array.isArray(entities)) {
            const maybeEntity = materializeEntity(
              operation.data.id,
              operationsById[operation.data.id]
            );
            if (maybeEntity) {
              entities.push(maybeEntity);
            }
          }
        }
      } else if (isRemoveFromHasManyOperation(operation)) {
        const entities = entity[operation.ref.relationship];
        if (Array.isArray(entities)) {
          entity[operation.ref.relationship] = entities.filter(
            (entity) => entity.id != operation.data.id
          );
        }
      } else if (isReplaceHasOneOperation(operation)) {
        if (operation.data) {
          entity[operation.ref.relationship] = materializeEntity(
            operation.data.id,
            operationsById[operation.data.id]
          );
        } else {
          entity[operation.ref.relationship] = null;
        }
      }
      return entity;
    },
    { id } as Entity
  );
}
