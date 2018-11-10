var bignum = require('bignum');

var merkleTree = require('./merkleTree.js');
var transactions = require('./transactions.js');
var util = require('./util.js');


/**
 * The BlockTemplate class holds a single job.
 * and provides several methods to validate and submit it to the daemon coin
**/
var BlockTemplate = module.exports = function BlockTemplate(jobId, rpcData, poolAddressScript, extraNoncePlaceholder, reward, txMessages, recipients){

    //private members

    var submits = [];

    function getMerkleHashes(steps){
        return steps.map(function(step){
            return step.toString('hex');
        });
    }

    function getTransactionBuffers(txs){
        var txHashes = txs.map(function(tx){
            if (tx.txid !== undefined) {
                return util.uint256BufferFromHash(tx.txid);
            }
            return util.uint256BufferFromHash(tx.hash);
        });
        return [null].concat(txHashes);
    }

    function getVoteData(){
        if (!rpcData.masternode_payments) return new Buffer([]);

        return Buffer.concat(
            [util.varIntBuffer(rpcData.votes.length)].concat(
                rpcData.votes.map(function (vt) {
                    return new Buffer(vt, 'hex');
                })
            )
        );
    }

    //public members

    this.rpcData = rpcData;
    this.jobId = jobId;

    this.target = bignum(rpcData.target, 16);

    this.difficulty = parseFloat((diff1 / this.target.toNumber()).toFixed(9));

    this.prevHashReversed = util.reverseBuffer(new Buffer(rpcData.previousblockhash, 'hex')).toString('hex');
    this.hashstaterootReversed = util.reverseBuffer(new Buffer(rpcData.hashstateroot, 'hex')).toString('hex');
    this.hashutxorootReversed = util.reverseBuffer(new Buffer(rpcData.hashutxoroot, 'hex')).toString('hex');
    this.bitsReversed = util.reverseBuffer(new Buffer(rpcData.bits, 'hex')).toString('hex');
    
    this.transactionData = Buffer.concat(rpcData.transactions.map(function(tx){
        return new Buffer(tx.data, 'hex');
    }));
    this.merkleTree = new merkleTree(getTransactionBuffers(rpcData.transactions));
    this.merkleBranch = getMerkleHashes(this.merkleTree.steps);
    this.generationTransaction = transactions.CreateGeneration(
        rpcData,
        poolAddressScript,
        extraNoncePlaceholder,
        reward,
        txMessages,
        recipients
    );

    this.serializeCoinbase = function(extraNonce1, extraNonce2){
        return Buffer.concat([
            this.generationTransaction[0],
            extraNonce1,
            extraNonce2,
            this.generationTransaction[1]
        ]);
    };


    //https://en.bitcoin.it/wiki/Protocol_specification#Block_Headers
    this.serializeHeader = function(merkleRoot, nTime, nonce){
        
        var header = new Buffer(144);
        var position = 0;
        header.write(nonce, position, 4, 'hex');
        header.write(rpcData.bits, position += 4, 4, 'hex');
        header.write(nTime, position += 4, 4, 'hex');
        header.write(merkleRoot, position += 4, 32, 'hex');
        header.write(rpcData.hashstateroot, position += 32, 32, 'hex');
        header.write(rpcData.hashutxoroot, position += 32, 32, 'hex');
        header.write(rpcData.previousblockhash, position += 32, 32, 'hex');
        header.writeUInt32LE(rpcData.version, position + 32);
        var header = util.reverseBuffer(header);
        return header;
    };

    this.serializeBlock = function(header, coinbase){
        return Buffer.concat([
            header,

            util.varIntBuffer(this.rpcData.transactions.length + 1),
            coinbase,
            this.transactionData,

            getVoteData(),

            //POS coins require a zero byte appended to block which the daemon replaces with the signature
            new Buffer(reward === 'POS' ? [0] : [])
        ]);
    };

    this.registerSubmit = function(extraNonce1, extraNonce2, nTime, nonce){
        var submission = extraNonce1 + extraNonce2 + nTime + nonce;
        if (submits.indexOf(submission) === -1){
            submits.push(submission);
            return true;
        }
        return false;
    };

    this.getJobParams = function(){
        if (!this.jobParams){
            this.jobParams = [
                this.jobId,
                this.prevHashReversed,
                this.generationTransaction[0].toString('hex'),
                this.generationTransaction[1].toString('hex'),
                this.merkleBranch,
                util.packInt32LE(this.rpcData.version).toString('hex'),
                this.bitsReversed,
                util.packUInt32BE(this.rpcData.curtime).toString('hex'),
                this.hashstaterootReversed,
                this.hashutxorootReversed,
                true
            ];
        }
        return this.jobParams;
    };
};
