import * as Faker from 'faker';
import { AdminComment } from '../../src/models';

export default function(factory: any) {
  factory.define('admin-comment', AdminComment, {
    userId: factory.assoc('user', 'id'),
    authorId: factory.assoc('internal-user', 'id'),
    message: Faker.hacker.phrase,
    isHighPriority: false,
  });
}
