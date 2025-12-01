import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';

export class Ec2MultiPortMonitorStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    /** ========================
     * ① 既存VPC取得
     ======================== */
    const vpc = ec2.Vpc.fromLookup(this, 'DefaultVPC', { isDefault: true });

    /** ========================
     * ② IAMロール
     ======================== */
    const role = new iam.Role(this, 'Ec2Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });

    role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy')
    );

    /** ========================
     * ③ ユーザーデータ（複数ポート監視）
     ======================== */
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      'yum install -y awscli',
      'cat << \'EOF\' > /opt/port_check.sh',
      '#!/bin/bash',
      'NAMESPACE="Custom/PortCheck"',
      'METRIC_NAME="PortStatus"',
      '',
      'declare -A targets=(',
      '  [example-rds.rds.amazonaws.com]=3306',
      '  [example.com]=443',
      '  [example.com]=22',
      ')',
      '',
      'for HOST in "${!targets[@]}"; do',
      '  PORT=${targets[$HOST]}',
      '  timeout 5 bash -c "</dev/tcp/$HOST/$PORT" &>/dev/null',
      '  if [ $? -eq 0 ]; then STATUS=1; else STATUS=0; fi',
      '  aws cloudwatch put-metric-data \\',
      '    --namespace "$NAMESPACE" \\',
      '    --metric-name "$METRIC_NAME" \\',
      '    --value "$STATUS" \\',
      '    --dimensions Host=$HOST,Port=$PORT',
      'done',
      'EOF',
      'chmod +x /opt/port_check.sh',
      '(crontab -l 2>/dev/null; echo "*/5 * * * * /opt/port_check.sh") | crontab -'
    );

    /** ========================
     * ④ EC2
     ======================== */
    new ec2.Instance(this, 'Linux2023Instance', {
      instanceType: new ec2.InstanceType('t3.micro'),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      vpc,
      role,
      userData,
    });

    /** ========================
     * ⑤ SNS 作成（メール通知）
     ======================== */
    const topic = new sns.Topic(this, 'PortAlertTopic', {
      displayName: 'Port Monitor Alert',
    });

    // ★送信先メールアドレス（ここを変更）
    const ALERT_EMAIL = 'yuhta.komatsu@gmail.com';

    topic.addSubscription(
      new subs.EmailSubscription(ALERT_EMAIL)
    );

    /** ========================
     * ⑥ CloudWatch アラーム
     *  PortStatus = 0 で即アラート
     ======================== */
    const metric = new cloudwatch.Metric({
      namespace: 'Custom/PortCheck',
      metricName: 'PortStatus',
      statistic: 'Minimum',
      period: cdk.Duration.minutes(5),
    });

    const alarm = new cloudwatch.Alarm(this, 'PortDownAlarm', {
      metric,
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      alarmDescription: 'Port Down Detected',
    });

    alarm.addAlarmAction({
      bind: () => ({ alarmActionArn: topic.topicArn }),
    });
  }
}
