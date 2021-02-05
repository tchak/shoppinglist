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

export type Identifier = { type: string; id: ID };
export type Attributes = Record<string, unknown>;
export type Entity = Identifier & Record<string, unknown | Entity[]>;
export type EntityLink = [Entity, string, Entity];

function isRemoved(operations: Operation[]) {
  return operations.find((operation) => isRemoveEntityOperation(operation));
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
  if (isRemoved(operations)) {
    return null;
  }
  return operations.reduce(
    (entity, operation) => {
      if (isAddEntityOperation(operation)) {
        entity.type = operation.ref.type;
        assignAttributes(entity, operation.data.attributes);
      } else if (isUpdateEntityOperation(operation)) {
        assignAttributes(entity, operation.data.attributes);
      } else if (isAddToHasManyOperation(operation)) {
        entity[operation.ref.relationship] ||= [];
        const relationship = entity[operation.ref.relationship];
        if (Array.isArray(relationship)) {
          relationship.push(markEntity(operation.data));
        }
      } else if (isRemoveFromHasManyOperation(operation)) {
        const relationship = entity[operation.ref.relationship];
        if (Array.isArray(relationship)) {
          entity[operation.ref.relationship] = relationship.filter(
            (entity) => entity.id !== operation.data.id
          );
        }
      } else if (isReplaceHasOneOperation(operation)) {
        if (operation.data) {
          entity[operation.ref.relationship] = markEntity(operation.data);
        } else {
          entity[operation.ref.relationship] = null;
        }
      }
      return entity;
    },
    { id } as Entity
  );
}

export function materializeEntityLink(
  [parent, key, { id }]: EntityLink,
  operations: Operation[]
) {
  const entity = materializeEntity(id, operations);
  if (entity) {
    if (Array.isArray(parent[key])) {
      (parent[key] as Entity[]).push(entity);
    } else {
      parent[key] = entity;
    }
  }
}

export function collectEntityLinks(entity: Entity): EntityLink[] {
  const links: EntityLink[] = [];
  const collections = new Set<string>();

  for (const [key, value] of Object.entries(entity)) {
    if (Array.isArray(value)) {
      for (const maybeEntity of value) {
        if (isEntity(maybeEntity)) {
          collections.add(key);
          links.push([entity, key, maybeEntity]);
          links.push(...collectEntityLinks(maybeEntity));
        }
      }
    } else if (isEntity(value)) {
      links.push([entity, key, value]);
      links.push(...collectEntityLinks(value));
    }
  }

  for (const key of collections) {
    entity[key] = [];
  }

  return links;
}

function isEntity(entity: unknown): entity is Entity {
  return !!entity && IS_ENTITY.has(entity as Entity);
}

function markEntity(entity: Entity): Entity {
  entity = { ...entity };
  IS_ENTITY.add(entity);
  return entity;
}

const IS_ENTITY = new WeakSet<Entity>();
