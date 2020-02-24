const ethers = require('ethers');

const tryCatchWrapper = fn => {
  return async(req, res) => {
    try {
      await fn(req, res);
    } catch (error) {
      res.json({status: 'error', message: error.message});
    }
  }
};

async function getProofOfBunchInclusion(startBlockNumber, bunchDepth, blockNumber, providerESN) {
  if(startBlockNumber instanceof ethers.utils.BigNumber) startBlockNumber = startBlockNumber.toNumber();
  if(bunchDepth instanceof ethers.utils.BigNumber) bunchDepth = bunchDepth.toNumber();
  if(blockNumber instanceof ethers.utils.BigNumber) blockNumber = blockNumber.toNumber();
  function _getProofOfBunchInclusion(inputArray, index, proof = '0x') {
    // console.log({inputArray});
    if(inputArray.length === 1) return proof;
    if(inputArray.length && (inputArray.length & (inputArray.length-1)) !== 0) {
      throw new Error('inputArray should be of length of power 2');
    }

    // index%2 === 1 (odd) then it must be right side
    // index%2 === 0 (even) then it must be left side

    if(index%2) {
      proof += '' + inputArray[index-1].slice(2);
    } else {
      proof += '' + inputArray[index+1].slice(2);
    }

    // computing hash of two pairs and storing them in reduced array
    const reducedArray = [];
    inputArray.reduce((accumulator, currentValue) => {
      if(accumulator) {
        // reducedArray.push(`[${accumulator}===${currentValue}]`);
        // console.log(accumulator+' '+(currentValue).slice(2));
        reducedArray.push(ethers.utils.keccak256(accumulator+(currentValue).slice(2)));
        return null;
      } else {
        return currentValue;
      }
    });

    return _getProofOfBunchInclusion(reducedArray, Math.floor(index/2), proof);
  }
  const blockNumbersToScan = [...Array(2**bunchDepth).keys()].map(n => n + startBlockNumber);
  // console.log({blockNumbersToScan});
  const blockArray = new Array(2**bunchDepth);

  // await Promise.all(blockNumbersToScan.map(number => {
  //   return new Promise(async function(resolve, reject) {
  //     const block = await providerESN.send('eth_getBlockByNumber', [
  //       ethers.utils.hexStripZeros(ethers.utils.hexlify(number)),
  //       true
  //     ]);
  //     blockArray[number - startBlockNumber] = ({
  //       blockNumber: number,
  //       transactionsRoot: block.transactionsRoot,
  //       receiptsRoot: block.receiptsRoot
  //     });
  //     // console.log(typeof number)
  //     resolve();
  //   });
  // }));

  for(const blockNumber of blockNumbersToScan) {
    console.log({blockNumber});
    await (number => {
      return new Promise(async function(resolve, reject) {
        const block = await providerESN.send('eth_getBlockByNumber', [
          ethers.utils.hexStripZeros(ethers.utils.hexlify(number)),
          true
        ]);
        blockArray[number - startBlockNumber] = ({
          blockNumber: number,
          transactionsRoot: block.transactionsRoot,
          receiptsRoot: block.receiptsRoot
        });
        // console.log(typeof number)
        resolve();
      });
    })(blockNumber);
  }

  return _getProofOfBunchInclusion(blockArray.map(block => block.transactionsRoot), blockNumber - startBlockNumber);
}

async function getBunchIndex(txObj, plasmaManagerInstance) {
  // const txObj = await providerESN.getTransaction(txHash);
  const blockNumber = txObj.blockNumber;
  // console.log({blockNumber});
  const lastBunchIndex = (await plasmaManagerInstance.functions.lastBunchIndex()).toNumber();
  if(lastBunchIndex === 0) return null;
  async function checkMiddle(start, end) {
    const current = Math.floor((start + end)/2);
    // console.log({start, end, current});
    const bunch = await plasmaManagerInstance.functions.bunches(current);
    const startBlockNumber = bunch.startBlockNumber.toNumber();
    const endBlockNumber = bunch.startBlockNumber.toNumber() + 2**bunch.bunchDepth.toNumber();
    console.log({startBlockNumber, blockNumber, endBlockNumber});
    if(startBlockNumber <= blockNumber && blockNumber <= endBlockNumber) {
      // the block is in bunch with index current
      return current;
    } else if(blockNumber < startBlockNumber) {
      // the block is in a bunch earlier than in bunch with index current
      return checkMiddle(start, Math.floor((start+end)/2));
    } else if(blockNumber > endBlockNumber) {
      // the block is in a bunch later than in bunch with index current
      return checkMiddle(Math.ceil((start+end)/2), end);
    } else if(start === end) {
      // the block is not even in the last bunch
      return null;
    }
  }

  const bunchIndex = await checkMiddle(0, lastBunchIndex - 1);
  return bunchIndex;
}

module.exports = { tryCatchWrapper, getProofOfBunchInclusion, getBunchIndex };
