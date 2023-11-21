export const convertEnumToArray = <T>(enumVal: any, numeric = false): T[] => {
  const maps: any[] = [];
  Object.keys(enumVal).forEach((key) => {
    const isNumber = !isNaN(Number(key));
    if (numeric) {
      if (isNumber) {
        maps.push(enumVal[key]);
      }
    } else {
      if (!isNumber) {
        maps.push(enumVal[key]);
      }
    }
  });
  return maps;
};
