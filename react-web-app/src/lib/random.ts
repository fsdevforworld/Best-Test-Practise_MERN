// rejection sampling for weighted random
function getSamples<T = string>(values: T[], probabilities: number[]) {
  return values.reduce((acc: T[], key: T, idx: number | number) => {
    for (let j = 0; j < probabilities[idx] * 100; j += 1) {
      acc.push(key);
    }
    return acc;
  }, []);
}

// ex: choice( ['A','B','C'], { p: [0.8, 0.1, 0.1] } );
export function choice<T = string>(
  values: T[],
  probabilities: number[] = [],
  randomFn: () => number,
) {
  const random = randomFn || Math.random;
  const choices = probabilities ? getSamples(values, probabilities) : values;
  return choices[Math.floor(random() * choices.length)];
}
