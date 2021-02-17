import fruits from './fruits.json';
import vegetables from './vegetables.json';
import condiments from './condiments.json';
import misc from './misc.json';

const food: string[] = [
  ...new Set([...fruits, ...vegetables, ...condiments, ...misc].map(titleize)),
];

function titleize(input: string) {
  return input.toLowerCase().replace(/(?:^|\s|-)\S/g, (x) => x.toUpperCase());
}

export default food;
