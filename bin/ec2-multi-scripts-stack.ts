#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { Ec2MultiPortMonitorStack } from '../lib/ec2-multi-scripts-stack-stack';

const app = new cdk.App();
new Ec2MultiPortMonitorStack(app, 'Ec2MultiPortMonitorStack', {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION 
  },
});