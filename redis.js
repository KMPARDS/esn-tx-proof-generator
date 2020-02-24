const getRedisClient = (() => {
  let client;
  return () => {
    if(!client) {
      client = require('redis').createClient();
    }
    return client;
  };
})();

const keyOutputPromises = {};

const redisPromise = (key, valueFn, expireSeconds = null) => {
  console.log(12);
  return new Promise(function(resolve, reject) {
    getRedisClient().get(key, async(err, value) => {
      console.log(23);
      if(err) {
        reject(err);
      }

      if(value) {
        console.log(345, value);
        resolve(value);
      } else {
        try {
          let outputPromise = keyOutputPromises[key] || (keyOutputPromises[key] = valueFn());
          console.log(34);
          const output = await outputPromise;
          if(expireSeconds) {
            getRedisClient().setex(key, expireSeconds, output);
          } else {
            getRedisClient().set(key, output);
          }
          resolve(output);
        } catch (error) {
          reject(error);
        }
        keyOutputPromises[key] = null;
      }
    });
  });
};
module.exports = { redisPromise };
