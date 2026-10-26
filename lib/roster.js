'use strict';
// Competidores y su código único. Solo estos códigos se aceptan en "Apoyar a un competidor"
// (en mayúsculas o minúsculas). Se cargan en cada evento al arrancar y al crear un evento nuevo.
module.exports = [
  [1, 'Ciprianos', 'CIP001'], [2, 'Perika', 'PER002'], [3, 'Dragon King', 'DK003'], [4, 'Bone Breaker', 'BB004'],
  [5, 'Dinamita MMA', 'DM005'], [6, 'Kenpo Vista Hermosa', 'KVH006'], [7, 'Panteras', 'PAN007'], [8, 'Mach MMA', 'MM008'],
  [9, 'Lions MMA', 'LM009'], [10, 'Kenpo San Marcos', 'KSM010'], [11, 'Dariel Reu', 'DR011'], [12, 'MDK', 'MDK012'],
  [13, 'OldCityMMA', 'OCM013'], [14, 'Ortiz Toledo MMA', 'OTM014'], [15, 'Jack Tayler', 'JT015'], [16, 'Pedro Toledo', 'PT016'],
].map(([n, name, code]) => ({ n, name, code }));
