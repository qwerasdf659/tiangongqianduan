import { defineComponent, h } from 'vue';

export const IconCamera = defineComponent({
  name: 'IconCamera',
  props: {
    class: {
      type: String,
      default: ''
    }
  },
  setup(props, { attrs }) {
    return () => h(
      'svg',
      {
        viewBox: '0 0 20 20',
        
        class: `tiangong-icons ${props.class}`,
        ...attrs
      },
      [
        h('path', {"d": "M160 288h128l80-128h288l80 128h128c36 0 64 28 64 64v480c0 36-28 64-64 64H160c-36 0-64-28-64-64V352c0-36 28-64 64-64z", "fillRule": "evenodd"})
      ]
    );
  }
});
