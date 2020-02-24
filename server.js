require('dotenv').config();
const express = require('express');
const { redisPromise } = require('./redis');

const ethers = require('ethers');
const { tryCatchWrapper, getProofOfBunchInclusion, getBunchIndex } = require('./functions');

const esnNodeUrl = process.env.NODE_ENV === 'production' ? 'http://localhost:8540' : process.env.ESN_PUBLIC_NODE;
const providerESN = new ethers.providers.JsonRpcProvider(esnNodeUrl);

const { GetProof } = require('eth-proof');
const getProof = new GetProof(esnNodeUrl);

const plasmaManagerInstance = new ethers.Contract(
  '0xC5B486a2268fEFe068CaecaFb8C05927b06567F9',
  require('./PlasmaManager_PlasmaManager.json').abi,
  ethers.getDefaultProvider('kovan')
);

const app = express();

app.use((req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Strict-Transport-Security': 'max-age=31536000; preload',
    'Access-Control-Allow-Origin': '*'
  });
  return next();
});

app.get('/ping', async(req, res) => {
  res.send('pong');
});

app.get('/blockNumber', tryCatchWrapper(async(req, res) => {
  const output = await redisPromise('blockNumber', async() => {
    return await providerESN.send('eth_blockNumber')
  }, 5);

  res.json({ status: 'success', data: output });
}));

app.get('/generate-tx-proof', tryCatchWrapper(async(req, res) => {
  console.log('received req generate tx proof');
  const provingTxHash = req.query.txHash;

  if(!provingTxHash) {
    throw new Error('ESN txHash parameter is not present');
  }

  ethers.utils.hexlify(provingTxHash);

  if(provingTxHash.length !== 66) {
    throw new Error('Invalid txHash length');
  }

  const output = await redisPromise(`txHash-${provingTxHash}`, async() => {
    console.log({providerESN});
    const txObj = await providerESN.getTransaction(provingTxHash);
    console.log({txObj});

    // add checks here for this transaction to be a deposit transaction, throw error if this tx is something else

    if(!txObj) {
      throw new Error('transaction not found on ESN');
    }

    const merklePatriciaProofObj = await getProof.transactionProof(provingTxHash);

    const bunchIndexOfTransaction = await getBunchIndex(txObj, plasmaManagerInstance);

    console.log({bunchIndexOfTransaction});

    if(bunchIndexOfTransaction === null) {
      throw new Error('Transaction not yet included in a Plasma Bunch');
    }

    const bunchStruct = await plasmaManagerInstance.functions.bunches(bunchIndexOfTransaction);

    console.log({bunchStruct});

    const bunchIndexOfTransactionHex = '0x' + bunchIndexOfTransaction.toString(16);
    const blockNumber = '0x' + txObj.blockNumber.toString(16);
    const proofOfBlockInclusionInBunch = await getProofOfBunchInclusion(
      bunchStruct.startBlockNumber,
      bunchStruct.bunchDepth,
      txObj.blockNumber,
      providerESN
    );
    const txRoot = '0x' + merklePatriciaProofObj.header[4].toString('hex')
    const rawTransaction = txObj.raw;
    const path = '0x00' + merklePatriciaProofObj.txIndex.slice(2);
    const parentNodes = ethers.utils.RLP.encode(merklePatriciaProofObj.txProof)

    const completeProofArray = [
      bunchIndexOfTransactionHex,
      blockNumber,
      proofOfBlockInclusionInBunch,
      txRoot,
      rawTransaction,
      path,
      parentNodes
    ];
    const completeProofRLP = ethers.utils.RLP.encode(completeProofArray);

    console.log({completeProofRLP});

    return completeProofRLP;
  });

  res.json({ status: 'success', data: output });
}));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Listening on PORT ${port}`));
