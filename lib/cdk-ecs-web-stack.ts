import {
  aws_ec2,
  aws_ecr,
  aws_ecs,
  aws_elasticloadbalancingv2,
  Duration,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import { Construct } from "constructs";

interface CdkEcsWebStackProps extends StackProps {
  vpcId: string;
  vpcName: string
}

export class CdkEcsWebStack extends Stack {
  constructor(scope: Construct, id: string, props: CdkEcsWebStackProps) {
    super(scope, id, props);

    // lookup an existed vpc 
    const vpc = aws_ec2.Vpc.fromLookup(
      this,
      "LookUpVpc",
      {
        vpcId: props.vpcId,
        vpcName: props.vpcName
      }
    )

    // ecs cluster
    const cluster = new aws_ecs.Cluster(this, "EcsClusterFlaskApp", {
      vpc: vpc,
      clusterName: "EcsClusterFlaskApp",
      containerInsights: true,
      enableFargateCapacityProviders: true,
      
    });

    // ecs task definition
    const task = new aws_ecs.FargateTaskDefinition(
      this,
      "FlaskTaskDefinition",
      {
        family: "latest",
        cpu: 2048,
        memoryLimitMiB: 4096,
        runtimePlatform: {
          operatingSystemFamily: aws_ecs.OperatingSystemFamily.LINUX,
          cpuArchitecture: aws_ecs.CpuArchitecture.X86_64,
        },
      }
    );

    // container
    const container = task.addContainer("FlaskAppContainer", {
      containerName: "FlaskAppContainer",
      memoryLimitMiB: 4096,
      memoryReservationMiB: 4096,
      stopTimeout: Duration.seconds(120),
      startTimeout: Duration.seconds(120),
      environment: {
        FHR_ENV: "DEPLOY",
      },
      image: aws_ecs.ContainerImage.fromEcrRepository(
        aws_ecr.Repository.fromRepositoryName(
          this,
          "FlaskAppRepository",
          "flask-app-demo"
        ),
      ),
      portMappings: [{ containerPort: 8080 }],
    });

    // service
    const service = new aws_ecs.FargateService(this, "FlaskService", {
      vpcSubnets: {
        subnetType: aws_ec2.SubnetType.PUBLIC
      },
      assignPublicIp: true,
      cluster: cluster,
      taskDefinition: task,
      desiredCount: 2,
      capacityProviderStrategies: [
        {
          capacityProvider: "FARGATE",
          weight: 1,
        },
        {
          capacityProvider: "FARGATE_SPOT",
          weight: 0,
        },
      ],
    });

    // scaling on cpu utilization
    const scaling = service.autoScaleTaskCount({
      maxCapacity: 4,
      minCapacity: 1,
    });

    scaling.scaleOnMemoryUtilization("CpuUtilization", {
      targetUtilizationPercent: 50,
    });

    // application load balancer
    const alb = new aws_elasticloadbalancingv2.ApplicationLoadBalancer(
      this,
      "AlbForEcs",
      {
        loadBalancerName: "AlbForEcsDemo",
        vpc: vpc,
        internetFacing: true,
      }
    );

    // add listener
    const listener = alb.addListener("Listener", {
      port: 80,
      open: true,
      protocol: aws_elasticloadbalancingv2.ApplicationProtocol.HTTP,
    });

    // add target
    listener.addTargets("EcsService", {
      port: 8080,
      targets: [
        service.loadBalancerTarget({
          containerName: "FlaskAppContainer",
          containerPort: 8080,
          protocol: aws_ecs.Protocol.TCP,
        }),
      ],
      healthCheck: {
        timeout: Duration.seconds(10),
      },
    });
  }
}
