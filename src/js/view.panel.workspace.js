/**
工作区面板的view
@module
@exports 工作区面板的view实例
**/
define([
    'jquery', 'jquery.defaultSetting', 'underscore', 'base/math',
    'view.panel.abstractSkeleton', 'view.abstractBone',
    'tmpl!html/panel.workspace.html', 'tmpl!html/panel.workspace.transformUtil.html'
], function(
    $, undefined, _, math,
    AbstractSkeleton, AbstractBone,
    workspaceTmpl, transformUtilTmpl
){
    var PANEL_NAME = 'workspace';
    var WorkspacePanel, Bone;

    // 减少搜索作用域链的局部变量
    var win = window,
        Math = win.Math;

    /**
    @class WorkspacePanel
    @extends AbstractSkeleton
    **/
    WorkspacePanel = AbstractSkeleton.extend({

        // 使用DOM中已有的元素作为此view的根元素
        el: '#js-workspacePanel',

        initialize: function(){
            // 复用父类的initialize方法
            WorkspacePanel.__super__.initialize.apply(this, arguments);

            // 这些事件回调函数虽然是此类的方法，但是并不通过 `events` 配置来绑定，
            // 所以绑定其执行上下文为此类的实例，
            // 以便跟通过 `events` 配置的事件回调函数的执行上下文保持一致
            [
                '_onMouseMoveCoordBg',
                '_onMouseUpCoordBg'
            ].forEach(function(method){
                this[method] = _.bind(this[method], this);
            }, this);

            // 保存具体的骨骼构造函数，覆盖从父类继承过来的抽象的骨骼构造函数
            this._Bone = Bone;

            // 当拖拽移动坐标系时，传递的数据
            this._grabCoordDataTransfer = {};
            // 重置调节骨骼时的状态表示
            this._resetState();

            // 保存在实例上，避免搜索作用域链，尤其是在频繁调用的函数中
            this._cos = Math.cos;
            this._sin = Math.sin;
            this._tan = Math.tan;
            this._atan = Math.atan;
            this._pow = Math.pow;
            this._round = Math.round;
            this._180_DIV_PI = 180 / Math.PI;
            this._PI_DIV_180 = Math.PI / 180;
            this._stringify = win.JSON.stringify;
            this._rotationAngle = math.rotationAngle;

            // 匹配transform的scale函数的正则表达式
            this._SCALE_REG = /scale\(((?:-?\d+(?:\.\d\d*)?)|(?:-?\.\d+))(?:,?\s*((?:-?\d+(?:\.\d\d*)?)|(?:-?\.\d+)))?\)/i;
            // 缩放的最大、最小比例
            this._ZOOM_MAX = 5;
            this._ZOOM_MIN = 0.1;
            // 每次缩放调整的步长
            this._ZOOM_STEP = 0.1;
        },

        /**
        渲染此面板
        @method render
        @param {Array} [bonesData] 多个骨骼的的当前数据
        **/
        render: function(bonesData){
            // 渲染空面板
            this.$el.html( workspaceTmpl());

            // 如果有传入骨骼数据，渲染出骨骼视图
            if(bonesData && bonesData.length){
                bonesData.forEach(function(boneData){
                    this.addBone(boneData);
                }, this);
            }

            // 缓存DOM元素：
            this._$emptyWording = this.$('#empty_wording');
            // 骨骼坐标系，
            // 此坐标系的原点就是此元素所在的位置，
            // x轴水平向右，y轴竖直向下，
            // 而骨骼的坐标就是相对于这个坐标系而言的
            this._$coordSys = this.$el.find('.js-coordinateSystem');
            // 骨骼坐标系的背景
            this._$coordSysBg = this.$el.find('.js-coordinateBg');
            // 展示骨骼坐标系当前缩放值的元素
            this._$currentScale = this.$el.find('.js-currentScale');
            // 骨骼坐标系
            // 覆盖从父类继承的、默认的骨骼容器
            this._boneDefaultContainer = this._$coordSys.find('.js-boneContainer').get(0);

            // 初始化骨骼坐标系的缩放比例、位置偏移
            this._$coordSys.css({
                'transform': 'scale(1,1)',
                'margin-left': '0px',
                'margin-top': '0px'
            });

            return this;
        },

        // 覆盖父类的同名方法
        updateBone: function(id, data, options){
            var parent;
            // 如果改变了某个骨骼的父骨骼，更新父子骨骼的DOM结构
            if( (parent = data.parent) ){
                this._boneHash[id]
                    .$el
                    .detach()
                    .appendTo(this._boneHash[parent].$el);
            }

            // 复用父类的同名方法
            WorkspacePanel.__super__.updateBone.apply(this, arguments);
        },

        // 覆盖父类的同名方法
        addBone: function(){
            this._$emptyWording.hide();

            // 复用父类的同名方法
            WorkspacePanel.__super__.addBone.apply(this, arguments);
        },

        // 获取激活骨骼的数据
        getBoneData: function(){
            return this._activeBone.getData();
        },

        // 获取激活骨骼的id
        getActiveBoneId: function(){
            return this._activeBone.id;
        },

        // 配置要委派的DOM事件
        events: {
            // 这个函数是是需要的,不然会按照浏览器的默认行为
            'dragover': function(){ return false },
            'drop': '_onDrop',
            'mousedown .js-bone': '_onMouseDownBone',
            'mousedown .js-activeBone': '_onMouseDownActiveBone',
            'mousedown .js-resize': '_onMouseDownResizePoint',
            'mousedown .js-rotate': '_onMouseDownRotatePoint',
            'mousedown .js-joint': '_onMouseDownJoint',
            // TODO: 
            // 在mousedown的时候先清除再给window绑定mousemove和mouseup，以免在工作区面板以外mouseup而没能触发相应操作，
            // 并且当mouseout window时，认为其mouseup了
            'mousemove': '_onMouseMove',
            'mouseup': '_onMouseUp',
            'mousewheel': '_onMouseWheel',
            'click .js-zoomOut': '_onClickZoomOut',
            'click .js-zoomIn': '_onClickZoomIn',
            'click .js-reset': '_onClickScaleReset',
            'mousedown .js-coordinateBg': '_onMouseDownCoordBg',
            'click .js-coordinateBg': '_onClickCoordBg'
        },

        /**
        当把图片拖拽放到工作区面板中时，读取图片的data url、宽高作为纹理图的url、骨骼的宽高，
        如果当前有激活元素，使用激活元素作为父骨骼。
        最后抛出 `addBone` 事件给controller以创建骨骼，带上骨骼的数据。
        TODO: 考虑把事件名改为 `dropTexture` ，因为 `addBone` 有“骨骼视图已添加”的含义
        TODO: 检验拖拽进来的文件是否图片文件
        TODO: 考虑优化，data url数据量太大了，直接设置到DOM属性中对性能不友好
        @triggerObj `workspacePanelView.$el` 工作区面板的根DOM元素
        @event drop DOM事件drop
        **/
        _onDrop: function(e){
            var panel = this,
                files, reader, i;

            //这里有个注意的地方，jquery帮你封event，而且里面居然没有我们需要的数据
            e = window.event;
            e.stopPropagation();
            e.preventDefault();
           
            files = e.dataTransfer.files;
            for(i = 0; i < files.length; i++){
                reader = new FileReader();
                // 先监听事件，再读取数据，等待事件触发
                reader.onload = onload;
                reader.readAsDataURL(files[i]);
            }

            /**
            写成函数声明而不是函数表达式，以免每循环一次重复创建一个函数对象
            @triggerObj {FileReader} `reader`
            @event onload
            **/
            function onload(){
                // 使用 `this` 即可访问到触发 `onload` 事件的 `reader`
                var texture = this.result,
                    img = new Image(),
                    boneData,
                    activeBone;

                // TODO: 验证是否图片
                img.src = texture;
                boneData = {
                    texture: texture
                };
                if(img.width){
                    boneData.w = img.width;
                    boneData.jointX = img.width / 2;
                }
                if(img.height){
                    boneData.h = img.height;
                    boneData.jointY = img.height / 2;
                }
                if(activeBone = panel._activeBone){
                    boneData.parent = activeBone.id;
                }

                // 通知外界
                panel.trigger('addBone', boneData);

                reader.onload = null;
                reader = null;
                img = null;
            }
        },

        // 当 `mousedown` 某个骨骼时，不管该骨骼是否激活，都激活之，
        // 并且为移动激活骨骼做好准备
        _onMouseDownBone: function($event){
            var $bone = $($event.currentTarget),
                boneId;

            boneId = Bone.htmlId2Id($bone.attr('id'));
            this.changeActiveBone(boneId);

            // 为移动激活骨骼做好准备
            this._onMouseDownActiveBone($event);
        },

        // 当鼠标左键 `mousedown` 激活骨骼时，记录下移动激活骨骼所需要的初始数据
        _onMouseDownActiveBone: function($event){
            var bone, parent;

            // 不是鼠标左键，直接返回，避免不必要的运算
            if($event.which !== 1) return;

            console.debug('Start adjust active bone: move');

            this._isMoving = true;

            this._mouseOldX = $event.pageX;
            this._mouseOldY = $event.pageY;

            bone = this._activeBone;
            this._boneOldX = bone.positionX();
            this._boneOldY = bone.positionY();

            this._parentRotateRadianToGlobal = 0;
            while(parent = bone.parent){
                this._parentRotateRadianToGlobal +=
                    parent.rotate() * this._PI_DIV_180;
                bone = parent;
            }

            // 避免冒泡到父骨骼；
            // 并确保 `_onMouseDownActiveBone` 在一次mousedown中只调用一次。
            // 因为 `_onMouseDownBone` 中会调用 `_onMouseDownActiveBone` ，而在 `events` 中也配置了 `_onMouseDownActiveBone` ，有可能重复调用
            $event.stopImmediatePropagation();
        },
            
        _onMouseDownResizePoint: function($event){
            var bone;

            // 不是鼠标左键，直接返回，避免不必要的运算
            if($event.which !== 1) return;

            console.debug('Start adjust active bone: resize bone & reposition joint at ratio');

            this._isResizing = true;

            this._mouseOldX = $event.pageX;
            this._mouseOldY = $event.pageY;

            bone = this._activeBone
            this._boneOldX = bone.positionX();
            this._boneOldY = bone.positionY();
            this._boneOldW = bone.width();
            this._boneOldH = bone.height();

            this._$joint = bone.$el.children('.js-joint');
            this._jointOldX = bone.jointX();
            this._jointOldY = bone.jointY();

            this._parentRotateRadianToGlobal = 0;
            while(parent = bone.parent){
                this._parentRotateRadianToGlobal +=
                    parent.rotate() * this._PI_DIV_180;
                bone = parent;
            }

            this._resizeIndex = $($event.currentTarget).data('index');

            // 避免事件冒泡到骨骼元素，进入moving状态
            $event.stopPropagation();
        },

        _onMouseDownRotatePoint: function($event){
            var bone, jointX, jointY;

            // 如果按下的不是鼠标左键，则直接返回，避免不必要的运算
            if($event.which !== 1) return;

            console.debug('Start adjust active bone: rotate');

            this._isRotating = true;

            bone = this._activeBone;
            this._boneOldRotate = bone.rotate();

            // 骨骼在无旋转的情况下相对于文档的偏移，加上关节相对于骨骼在骨骼无旋转的情况下的坐标，就得到关节此时相对于文档的坐标
            jointOffsetLeft =
                this._jointOldOffsetLeft =
                bone.offsetLeftOnRotate0() + bone.jointX();
            jointOffsetTop =
                this._jointOldOffsetTop =
                bone.offsetTopOnRotate0() + bone.jointY();

            // 再用鼠标此时的坐标减去得到的关节坐标，就得到此时的关节鼠标向量（从关节指向鼠标的向量）。
            // 最后即可计算出此时（开始调节旋转角度时），水平向左向量顺时针旋转到与关节鼠标向量时所转过的角度
            this._joint2MouseOldRotate = this._rotationAngle(
                $event.pageX - jointOffsetLeft,
                $event.pageY - jointOffsetTop
            );

            // 这句输出用于调试旋转
            // console.debug(
            //     'Bone old rotate %fdeg, joint-mouse vector old rotate %fdeg, joint old offset {%f, %f}',
            //     this._boneOldRotate,
            //     this._joint2MouseOldRotate,
            //     this._jointOldOffsetLeft, this._jointOldOffsetTop
            // );

            // 避免事件冒泡到骨骼元素，进入moving状态
            $event.stopPropagation();
        },

        _onMouseDownJoint: function($event){
            var bone;

            // 不是鼠标左键，直接返回，避免不必要的运算
            if($event.which !== 1) return;

            console.debug('Start adjust active bone: move joint');

            this._isMovingJoint = true;

            this._mouseOldX = $event.pageX;
            this._mouseOldY = $event.pageY;

            bone = this._activeBone;

            this._boneOldX = bone.positionX();
            this._boneOldY = bone.positionY();

            this._jointOldX = bone.jointX();
            this._jointOldY = bone.jointY();

            // 缓存的关节控制点
            this._$joint = $($event.currentTarget);

            this._parentRotateRadianToGlobal = 0;
            while(parent = bone.parent){
                this._parentRotateRadianToGlobal +=
                    parent.rotate() * this._PI_DIV_180;
                bone = parent;
            }

            // 避免事件冒泡到骨骼元素，进入moving状态
            $event.stopPropagation();
        },

        // TODO:
        // 可以实现监测这个函数的运行时间，如果时长太长，或太频繁，
        // 可以选择性的执行其中的计算，比如每两次执行一次
        _onMouseMove: function($event){
            // 在此函数中建立一个坐标系：
            // 此坐标系是正在调节的骨骼的坐标系，
            // 原点为骨骼的关节点；
            // x轴为父骨骼的x轴按顺时针旋转rotate度的方向；
            // y轴为父骨骼的y轴按顺时针旋转rotate度的方向；
            // 其中rotate为 **进入此函数时** 骨骼按顺时针旋转的角度；
            // 同理，递归的建立父骨骼的坐标系即可得到父骨骼的x/y轴，进而得到骨骼的x/y轴，
            // 如果没有父骨骼，用水平向右/竖直向下代替父骨骼的x/y轴。
            // 此函数结束前，坐标系不变；重新进入此函数，重新建立坐标系

            var // 改变了的骨骼数据
                changedData,
                // 激活的骨骼
                bone,
                // 如果正在调节大小，表示骨骼当前的旋转角度；
                // 如果正在调节旋转角度，表示调节前骨骼的旋转角度；
                rotate,
                // `rotate` 对应的弧度
                rotateRadian,
                // `rotateRadian` 的正弦/余弦
                sinRotateRadian, cosRotateRadian,
                // 骨骼相对于世界的旋转角度所对应的弧度
                rotateRadianToGlobal,
                // 父骨骼相对于世界的旋转角度所对应的弧度
                parentRotateRadianToGlobal,
                // 鼠标位置在水平、竖直方向上的变化量（当前位置相对于起始位置的变化量），
                // **鼠标移动向量** 由这两个分量构成
                mouseHoriVar, mouseVertVar,
                // 鼠标移动向量在 **父骨骼的坐标系的** x/y轴上的投影
                mouseParentXVar, mouseParentYVar,
                // 鼠标移动向量在x/y轴上的投影
                mouseXVar, mouseYVar,
                // 骨骼位置在x/y轴上的变化量
                xVar, yVar,
                // 骨骼旋转角度的变化量，
                // 即鼠标起始位置与关节点连成的直线，关于关节点旋转多少度，到达鼠标当前位置与关节点连成的直线。
                // 取值范围为 [-180deg, 180deg]
                variationRotate,
                // 关节点分别到鼠标起始位置与当前位置构成的向量
                jointOldVector, jointVector,
                // 关节点相对于骨骼的当前坐标
                jointX, jointY,
                joint2MouseRotate,
                joint2MouseVectorHori, joint2MouseVectorVert,
                cos, sin, tan,
                pow = this._pow,
                powerNum = pow(10, 18);

            // 如果没有激活骨骼，直接返回
            if( !(bone = this._activeBone) ) return;

            changedData = this._boneChangedData = this._boneChangedData || {};

            // TODO: 先判断是否需要这些数据
            mouseHoriVar = ($event.pageX * powerNum - this._mouseOldX * powerNum) / powerNum;
            mouseVertVar = ($event.pageY * powerNum - this._mouseOldY * powerNum) / powerNum;
            rotate = bone.rotate();
            rotateRadian = rotate * this._PI_DIV_180;
            rotateRadianToGlobal = this._parentRotateRadianToGlobal + rotateRadian;
            parentRotateRadianToGlobal = this._parentRotateRadianToGlobal;
            jointX = bone.jointX();
            jointY = bone.jointY();
            cos = this._cos;
            sin = this._sin;
            tan = this._tan;


            if(this._isMoving){
                // 将鼠标在水平/竖直方向上的变化量转变为 **父骨骼坐标系的** x/y轴上的变化量
                mouseParentXVar =
                    mouseHoriVar * cos(parentRotateRadianToGlobal) +
                    mouseVertVar * sin(parentRotateRadianToGlobal);
                mouseParentYVar =
                    mouseVertVar * cos(parentRotateRadianToGlobal) -
                    mouseHoriVar * sin(parentRotateRadianToGlobal);

                bone.positionX(
                    changedData.x = this._boneOldX + mouseParentXVar
                );
                bone.positionY(
                    changedData.y = this._boneOldY + mouseParentYVar
                );

                // 清除无效缓存
                this._offsetTop = null;
                this._offsetLeft = null;
            }

            // TODO: 兼容缩小到0的边界情况
            if(this._isResizing){
                // 将鼠标在水平/竖直方向上的变化量转变为x/y轴上的变化量
                mouseXVar =
                    mouseHoriVar * cos(rotateRadianToGlobal) +
                    mouseVertVar * sin(rotateRadianToGlobal);
                mouseYVar =
                    mouseVertVar * cos(rotateRadianToGlobal) -
                    mouseHoriVar * sin(rotateRadianToGlobal);

                switch(this._resizeIndex){
                    case 1:
                        mouseXVar *= -1;
                        mouseYVar *= -1;
                        break;
                    case 2:
                        mouseYVar *= -1;
                        break;
                    case 3:
                        mouseXVar *= -1;
                        break;
                }

                // x轴方向上的修改
                xVar = mouseXVar / (this._boneOldW / this._jointOldX - 1) * -1;
                changedData.w = this._boneOldW + mouseXVar - xVar;
                // TODO: 如果是负数，则翻转之
                if(changedData.w >= 0){
                    bone.width(changedData.w)
                        .positionX(changedData.x = this._boneOldX + xVar)
                        .jointX(changedData.jointX = this._jointOldX - xVar);
                    this._$joint
                        .css('left', changedData.jointX + bone.SIZE_UNIT);
                }

                // y轴方向上的修改
                yVar = mouseYVar / (this._boneOldH / this._jointOldY - 1);
                changedData.h = yVar + this._boneOldH + mouseYVar;
                // TODO: 如果是负数，则翻转之
                if(changedData.h >= 0){
                    bone.height(changedData.h)
                        .positionY(changedData.y = this._boneOldY - yVar)
                        .jointY(changedData.jointY = this._jointOldY + yVar);
                    this._$joint
                        .css('top', changedData.jointY + bone.SIZE_UNIT);
                }

                // 清除无效缓存
                this._offsetTop = null;
                this._offsetLeft = null;
            }

            if(this._isRotating){
                joint2MouseRotate = this._rotationAngle(
                    (joint2MouseVectorHori = $event.pageX - this._jointOldOffsetLeft),
                    (joint2MouseVectorVert = $event.pageY - this._jointOldOffsetTop)
                );
                // 此时的关节鼠标向量相对水平向左向量的旋转角度，
                // 减去开始调节时关节鼠标向量相对水平向左向量的旋转角度，
                // 就得到关节鼠标向量转过的角度，即骨骼旋转角度的变化量
                bone.rotate(
                    changedData.rotate = joint2MouseRotate - this._joint2MouseOldRotate + this._boneOldRotate
                );
            }

            // TODO: 实现移动关节点时，骨骼不动
            if(this._isMovingJoint){
                // 将鼠标在水平/竖直方向上的变化量转变为x/y轴上的变化量
                mouseXVar =
                    mouseHoriVar * (cos(rotateRadianToGlobal) * powerNum) +
                    mouseVertVar * (sin(rotateRadianToGlobal) * powerNum);
                mouseYVar =
                    mouseVertVar * (cos(rotateRadianToGlobal) * powerNum) -
                    mouseHoriVar * (sin(rotateRadianToGlobal) * powerNum);

                console.log({
                    mouseXVar: mouseXVar,
                    jointOldX: this._jointOldX
                })

                changedData.jointX = (mouseXVar + this._jointOldX * powerNum) / powerNum;
                changedData.jointY = (mouseYVar + this._jointOldY * powerNum) / powerNum;

                sinRotateRadian = sin(rotateRadian) * powerNum;
                cosRotateRadian = cos(rotateRadian) * powerNum;

                xVar = ( (cosRotateRadian - powerNum) / powerNum * mouseXVar - sinRotateRadian / powerNum * mouseYVar ) / powerNum;
                yVar = ( sinRotateRadian / powerNum * mouseXVar + (cosRotateRadian - powerNum) / powerNum * mouseYVar ) / powerNum;

                // 表示关节点的 `transform-origin` 属性，其坐标是相对于骨骼div在无旋转时的左上角
                bone.jointX( changedData.jointX )
                    .jointY( changedData.jointY )
                    .positionX( this._boneOldX + xVar )
                    .positionY( this._boneOldY + yVar );
                this._$joint
                    .css({
                        'left': changedData.jointX + bone.SIZE_UNIT,
                        'top': changedData.jointY + bone.SIZE_UNIT
                    });
            }
        },

        _onMouseUp: function($event){
            var activeBone;

            if( !(this._isMoving ||
                this._isResizing ||
                this._isRotating ||
                this._isMovingJoint)
            ){
                return;
            }

            console.debug(
                'End adjust active bone, change data: ' +
                this._stringify(this._boneChangedData)
            );

            // 拖拽调节结束时，再通知外界骨骼的数据有更新，
            // 而不是一边拖拽一边频繁的通知外界。
            // 并且是如果有数据更新，才通知外界
            if(this._boneChangedData){                
                this.trigger('updatedBoneData', this._activeBone.id, this._boneChangedData);
            }

            // 重置调节骨骼时的状态表示
            this._resetState();
        },

        // 如果鼠标在工作区上滑动鼠标滚轮，缩放骨骼坐标系
        // TODO: 研究怎么阻止浏览器在按住ctrl且滑动鼠标滚轮时缩放页面
        _onMouseWheel: function($event){
            var event = $event.originalEvent;
            if(event.wheelDelta > 0){
                this._zoomIn();
            }
            else{
                this._zoomOut();
            }
        },

        // 当点击骨骼坐标系的放大按钮时，放大骨骼坐标系
        _onClickZoomOut: function(){
            this._zoomOut();
        },

        // 当点击骨骼坐标系的缩小按钮时，缩小骨骼坐标系
        _onClickZoomIn: function(){
            this._zoomIn();
        },

        // 当点击骨骼坐标系的缩放重置按钮时，重置骨骼坐标系的缩放
        // TODO: scale变换函数，提供第一个参数就可以了
        _onClickScaleReset: function(){
            this._$coordSys.css('transform', 'scale(1,1)');
            this._$currentScale.text('100');
            console.debug('Panel %s scale coordinate system to 1', this.panelName);
        },

        // 当在骨骼坐标系的背景上按下鼠标时，兼容事件 `mousemove` 和 `mouseup` ，
        // 以实现移动骨骼坐标系
        _onMouseDownCoordBg: function($event){
            var dataTransfer = this._grabCoordDataTransfer,
                $coordSys = this._$coordSys;

            dataTransfer.mouseOldX = $event.pageX;
            dataTransfer.mouseOldY = $event.pageY;
            dataTransfer.coordSysOldX = parseFloat($coordSys.css('margin-left'));
            dataTransfer.coordSysOldY = parseFloat($coordSys.css('margin-top'));

            console.debug(
                'Start grabbing bone coordinate system whose offset is (%f, %f)',
                dataTransfer.coordSysOldX, dataTransfer.coordSysOldY
            );

            // 修改鼠标手势，表示正在拖拽移动
            this._$coordSysBg.addClass('js-grabbing');

            $(window)
                .on('mousemove', this._onMouseMoveCoordBg)
                .on('mouseup', this._onMouseUpCoordBg);
        },

        _onMouseMoveCoordBg: function($event){
            var dataTransfer = this._grabCoordDataTransfer;
            this._$coordSys
                .css({
                    'margin-left': dataTransfer.coordSysOldX + $event.pageX - dataTransfer.mouseOldX,
                    'margin-top': dataTransfer.coordSysOldY + $event.pageY - dataTransfer.mouseOldY
                });
        },

        _onMouseUpCoordBg: function($event){
            var $coordSys = this._$coordSys;

            $(window)
                .off('mousemove', this._onMouseMoveCoordBg)
                .off('mouseup', this._onMouseUpCoordBg);

            // 修改鼠标手势，表示结束拖拽移动
            this._$coordSysBg.removeClass('js-grabbing');

            // 清理此次拖拽移动的数据
            _.keys( this._grabCoordDataTransfer )
                .forEach(function(key){
                    this[key] = null;
                }, this._grabCoordDataTransfer);

            console.debug(
                'End grabbing bone coordinate system whose offset is (%f, %f)',
                parseFloat($coordSys.css('margin-left')),
                parseFloat($coordSys.css('margin-top'))
            );
        },

        // 如果没点击到骨骼，去除激活骨骼的样式，但不切换激活骨骼。
        // 这里之所以能把“点击坐标系的背景”认为是“没点击到骨骼”，前提是满足骨骼元素不是背景元素的子元素
        _onClickCoordBg: function($event){
            this._activeBone
                .hideActiveStyle();
        },

        // 重置调节骨骼时的状态表示
        _resetState: function(){
            // 表示当前状态的各种私有属性
            // 是否正在调节已激活骨骼的位置
            this._isMoving = false;
            // 是否正在调节已激活骨骼的旋转
            this._isRotating = false;
            // 是否正在调节已激活骨骼的大小
            this._isResizing = false;
            // 是否正在调节已激活骨骼的关节位置
            this._isMovingJoint = false;

            // 开始调节时，父骨骼相对于世界的旋转
            this._parentRotateRadianToGlobal = null;

            // 开始调节时，鼠标相对于 `document` 的坐标
            this._mouseOldX = null;
            this._mouseOldY = null;

            // 开始调节时，骨骼的坐标
            this._boneOldX = null;
            this._boneOldY = null;

            // 开始调节时，骨骼的大小
            this._boneOldW = null;
            this._boneOldH = null;

            // 关节元素的jquery对象，
            // 在开始调节时缓存起来，调节时不用频繁搜索DOM，
            // 每次调节结束，断开引用，以免内存泄漏
            this._$joint = null;

            // 开始调节时，关节的坐标
            this._jointOldX = null;
            this._jointOldY = null;

            // 开始调节时，关节相对于文档的坐标
            this._jointOldOffsetLeft = null;
            this._jointOldOffsetTop = null;

            // 开始调节旋转角度时，水平向左向量顺时针旋转到，与关节鼠标向量（从关节指向鼠标的向量）平行时，所转过的角度
            this._joint2MouseOldRotate = null;

            // 在调节骨骼的过程中，有修改过的数据的最新值。
            // 只在调节过程中有值。没包含的字段，表示没有修改
            this._boneChangedData = null;

            // resize控制点的序号。
            // 使用不同的控制点进行resize，算法有所不同
            this._resizeIndex = null;

            return this;
        },

        // 放大骨骼坐标系。
        // 如果已经放大到最大值，就什么也不做。
        // TODO: scale变换函数，提供第一个参数就可以了
        _zoomIn: function(){
            var $coordSys = this._$coordSys,
                oldTransform, oldScale,
                scaleX, scaleY;

            oldTransform = $coordSys.css('transform');
            oldScale = oldTransform.match(this._SCALE_REG);
            scaleX = this._round((parseFloat(oldScale[1]) + this._ZOOM_STEP) * 10) / 10;
            scaleY = this._round((parseFloat(oldScale[2]) + this._ZOOM_STEP) * 10) / 10;

            if(scaleX <= this._ZOOM_MAX){
                $coordSys.css(
                    'transform',
                    'scale(' + scaleX + ',' + scaleY + ')'
                );
                this._$currentScale.text(parseInt(scaleX * 100));
                console.debug(
                    'Panel %s zoom in coordinate system to %s',
                    this.panelName, scaleX
                );
            }
        },

        // 缩小骨骼坐标系。
        // 如果已经缩小到最小值，就什么也不做
        _zoomOut: function(){
            var $coordSys = this._$coordSys,
                oldTransform, oldScale,
                scaleX, scaleY;

            oldTransform = $coordSys.css('transform');
            oldScale = oldTransform.match(this._SCALE_REG);
            scaleX = this._round((parseFloat(oldScale[1]) - this._ZOOM_STEP) * 10) / 10;
            scaleY = this._round((parseFloat(oldScale[2]) - this._ZOOM_STEP) * 10) / 10;

            if(scaleX >= this._ZOOM_MIN){
                $coordSys.css(
                    'transform',
                    'scale(' + scaleX + ',' + scaleY + ')'
                );
                this._$currentScale.text(parseInt(scaleX * 100));
                console.debug(
                    'Panel %s zoom out coordinate system to %s',
                    this.panelName, scaleX
                );
            }
        }
    });


    /**
    专用于此面板的骨骼view
    @class Bone
    @extends AbstractBone
    **/
    Bone = AbstractBone.extend({
        transformUtilTmpl: transformUtilTmpl,

        initialize: function(){
            // 复用父类上的方法
            Bone.__super__.initialize.apply(this, arguments);

            this.$el.attr('draggable', false);

            // 几何数据的尺寸单位
            this.SIZE_UNIT = 'px';

            // 缓存骨骼的数据
            // 避免每次获取数据时，都要访问dom
            this._name = null;
            this._texture = null;
            this._jointX = null;
            this._jointY = null;
            this._rotate = null;
            this._w = null;
            this._h = null;
            this._x = null;
            this._y = null;
            this._z = null;
            this._opacity = null;
        },

        // 覆盖父类的同名方法
        render: function(boneData, container, options){
            var texture;

            texture = boneData.texture || '';

            // 缓存DOM元素
            this._$texture = $('<img class="js-texture" src="' + texture + '"/>');

            // 确保添加为第一个子元素
            this.$el.prepend( this._$texture );
            // 纹理图已添加，不需要在父类方法中添加
            delete boneData.texture;

            // 复用父类中被覆盖的同名方法
            return Bone.__super__.render.apply(this, arguments);
        },

        // 激活此骨骼，表示开始操作此骨骼
        activate: function(){
            var returnFromSuperClass;

            // 复用父类中被覆盖的同名方法
            returnFromSuperClass = Bone.__super__.activate.apply(this, arguments);

            // TODO: 缓存 `.js-transform-util` 元素
            this._$texture
                .after(this.transformUtilTmpl())
            this.$el
                .children('.js-joint')
                .css({
                    left: this.jointX(),
                    top: this.jointY()
                });

            return returnFromSuperClass;
        },

        // 取消激活此骨骼，表示结束操作此骨骼
        deactivate: function(){
            this.$el
                .children('.js-transform-util').remove();

            // 复用父类中被覆盖的同名方法。
            // 执行移除操作的方法，先执行子类中的，再执行父类中的，
            // 因为父类中的逻辑更根本
            return Bone.__super__.deactivate.apply(this, arguments);
        },

        /**
        一次更新骨骼的多项数据
        @param {Object} data
            @param {Number} [data.texture]
            @param {Number} [data.jointX]
            @param {Number} [data.jointY]
            @param {Number} [data.rotate]
            @param {Number} [data.w]
            @param {Number} [data.h]
            @param {Number} [data.x]
            @param {Number} [data.y]
            @param {Number} [data.z]
            @param {Number} [data.opacity]
        @return this
        **/
        update: function(data){
            var MAP, field;
            if(!data) return this;

            MAP = this.FIELD_2_METHOD;
            for(field in MAP){
                if( !MAP.hasOwnProperty(field) ) continue;
                if(field in data) this[MAP[field]](data[field]);
            }

            return this;
        },

        /**
        获取此骨骼的完整数据
        **/
        getData: function(){
            return {
                name: this._name,
                texture: this._texture,
                w: this._w,
                h: this._h,
                x: this._x,
                y: this._y,
                z: this._z,
                rotate: this._rotate,
                opacity: this._opacity,
                jointX: this._jointX,
                jointY: this._jointY
            };
        },
        
        /*
        Start: 原子性的设置或获取骨骼数据的方法 
        请使用这些方法或 `update()` 来修改骨骼的数据，
        而不是 `this.$el` ，以保证缓存数据的正确性
        */

        /**
        设置或获取骨骼名
        @param {String} [url] 要设置成的骨骼名
        @return {this|String} this, 或骨骼名
        **/
        name: function(name){
            if(name !== void 0){
                this._name = name;
                return this;
            }
            else{
                return this._name;
            }
        },
        
        /**
        设置或获取骨骼的纹理图。
        因为给jquery的 `.css()` 方法添加了钩子，
        可以直接用url来设置 `backgroundImage` 属性，
        或直接从 `backgroundImage` 属性获取url
        @param {String} [url] 要设置成的纹理图的url
        @return {this|String} this, 或纹理图的url
        **/
        texture: function(url){
            if(url !== void 0 && url !== this._texture){
                this._$texture.attr('src', url);
                this._texture = url;
                return this;
            }
            else{
                return this._texture;
            }
        },

        /**
        设置或获取关节的水平坐标。
        因为给jquery的 `.css()` 方法添加了钩子，
        用 `.css()` 方法设置 `transformOriginX` 属性时，能自动添加浏览器厂商前缀
        @param {Number} [x] 要设置成的水平坐标
        @return {this|Number}
        **/
        jointX: function(x){
            return this._styleInSizeUnit('transformOriginX', x, '_jointX');
        },

        /**
        设置或获取关节的垂直坐标。
        因为给jquery的 `.css()` 方法添加了钩子，
        用 `.css()` 方法设置 `transformOriginY` 属性时，能自动添加浏览器厂商前缀
        @param {Number} [y] 要设置成的水平坐标
        @return {this|Number}
        **/
        jointY: function(y){
            return this._styleInSizeUnit('transformOriginY', y, '_jointY');
        },

        /**
        设置或获取骨骼的旋转角度。
        因为给jquery的 `.css()` 方法添加了钩子，
        用jquery的 `.css()` 方法设置或获取css属性 `transform` 时：
        支持自动添加适当的浏览器厂商前缀；
        支持设置多个变换函数，而只会覆盖同名的变换函数，不覆盖不同名的；
        @param {Number} [angle] 要设置成的旋转角度
        @return {this|Number}
        **/
        rotate: function(angle){
            if(angle !== void 0 && angle !== this._rotate){
                typeof angle !== 'number' && console.warn('Attribute\'s data type is wrong');
                this.$el.css('transform', 'rotate(' + angle + 'deg)');
                this._rotate = angle;
                return this;
            }
            else{
                return this._rotate;
            }
        },

        /**
        设置或获取骨骼的宽度
        @param {Number} [w] 要设置成的宽度
        @return {this|Number}
        **/
        width: function(w){
            return this._styleInSizeUnit('width', w, '_w');
        },

        /**
        设置或获取骨骼的高度
        @param {Number} [h] 要设置成的高度
        @return {this|Number}
        **/
        height: function(h){
            return this._styleInSizeUnit('height', h, '_h');
        },

        /**
        设置或获取骨骼的水平坐标
        @param {Number} [x] 要设置成的水平坐标
        @return {this|Number}
        **/
        positionX: function(x){
            // 清理缓存数据
            this._offsetLeft = null;
            return this._styleInSizeUnit('left', x, '_x');
        },

        /**
        设置或获取骨骼的竖直坐标
        @param {Number} [y] 要设置成的竖直坐标
        @return {this|Number}
        **/
        positionY: function(y){
            // 清理缓存数据
            this._offsetTop = null;
            return this._styleInSizeUnit('top', y, '_y');
        },

        /**
        设置或获取骨骼的垂直屏幕方向上的坐标
        @param {Number} [z] 要设置成的坐标
        @return {this|Number}
        **/
        positionZ: function(z){
            if(z !== void 0 && z !== this._z){
                typeof z !== 'number' && console.debug('Warn: attribute type wrong');
                this.$el.css('zIndex', z);
                this._z = z;
                return this;
            }
            else{
                return this._z;
            }
        },

        /**
        设置或获取骨骼的透明度
        @param {Number} [alpha] 要设置成的透明度
        @return {this|Number}
        **/
        opacity: function(alpha){
            if(alpha !== void 0 && alpha !== this._opacity){
                typeof alpha !== 'number' && console.debug('Warn: attribute type wrong');
                this.$el.css('opacity', alpha);
                this._opacity = alpha;
                return this;
            }
            else{
                return this._opacity;
            }
        },

        /***** End: 原子性的设置或获取骨骼数据的方法 *****/

        /**
        获取当旋转角度为0时，相对于文档左边的偏移
        @return {Number}
        **/
        offsetLeftOnRotate0: function(){
            var offset;

            // 如果有缓存数据，直接返回
            if(this._offsetLeft != null){
                return this._offsetLeft;
            }

            offset = this._offsetOnRotate0();
            // 将数据缓存起来
            this._offsetTop = offset.top;
            return this._offsetLeft = offset.left;
        },

        /**
        获取当旋转角度为0时，相对于文档顶部的偏移
        @return {Number}
        **/
        offsetTopOnRotate0: function(){
            var offset;

            // 如果有缓存数据，直接返回
            if(this._offsetTop != null){
                return this._offsetTop;
            }

            offset = this._offsetOnRotate0();
            // 将数据缓存起来
            this._offsetLeft = offset.left;
            return this._offsetTop = offset.top;
        },

        _styleInSizeUnit: function(prop, val, cacheProp){
            if(val !== void 0){
                typeof val !== 'number' && console.warn('Attribute\'s data type is wrong');
                this.$el.css(prop, val + this.SIZE_UNIT);
                this[cacheProp] = val;
                return this;
            }
            else{
                return this[cacheProp];
            }
        },

        /**
        获取旋转角度为0时，相对于文档的坐标。
        请确保在调用此方法时，骨骼元素在DOM中。
        @return {Object} position
            @return {Object} position.left
            @return {Object} position.top
        **/
        _offsetOnRotate0: function(){
            var $cloneEl, offset;

            // 复制一个一样的元素，但使其透明且旋转角度为0，获取其相对于文档的坐标即可
            offset = ($cloneEl = this.$el.clone(false, false))
                .empty()
                .css({
                    opacity: 0,
                    transform: 'rotate(0deg)'
                })
                .insertAfter(this.el)
                .offset();
            $cloneEl.remove();
            $cloneEl = null;

            return offset;
        }
    }, {
        // 覆盖继承自父类的同名属性，用于构成骨骼的html id
        _panelName: PANEL_NAME
    });

    return new WorkspacePanel({panelName: PANEL_NAME});
});
